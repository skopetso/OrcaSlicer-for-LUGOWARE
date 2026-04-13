const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, ActivityLog } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/auth/check-setup - Check if any users exist
router.get('/check-setup', async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    res.json({ needsSetup: userCount === 0 });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/register
// POST /api/auth/register - Self-register (pending) or first user (admin0, approved)
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    // Check if username already exists
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const userCount = await User.countDocuments();
    const isFirstUser = userCount === 0;

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await User.createNew({
      username,
      passwordHash,
      role: isFirstUser ? 'admin0' : 'user',
      status: isFirstUser ? 'approved' : 'pending',
      createdBy: null,
    });

    // Log activity
    await ActivityLog.create({
      userId: user.id || user._id,
      username: user.username,
      action: 'user_registered',
      details: { role: user.role, status: user.status },
    });

    if (isFirstUser) {
      // First user: approved, return token
      const token = jwt.sign({ userId: user.id || user._id }, process.env.JWT_SECRET, { expiresIn: '999y' });
      res.status(201).json({ token, user: user.toJSON() });
    } else {
      // Pending: no token
      res.status(201).json({ pending: true, message: 'Account created. Waiting for admin approval.' });
    }
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Server error during registration' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Check status before password
    if (user.status === 'pending') {
      return res.status(403).json({ error: 'Account pending approval', pending: true });
    }
    if (user.status === 'rejected') {
      return res.status(403).json({ error: 'Account has been rejected' });
    }
    if (user.status === 'password_reset') {
      return res.status(403).json({ error: 'Password has been reset. Please set a new password.', passwordReset: true, userId: user.id || user._id });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign({ userId: user.id || user._id }, process.env.JWT_SECRET, { expiresIn: '999y' });

    // Log activity
    await ActivityLog.create({
      userId: user.id || user._id,
      username: user.username,
      action: 'user_login',
    });

    res.json({
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST /api/auth/set-new-password - Set new password after admin reset
router.post('/set-new-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'userId and newPassword are required' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.status !== 'password_reset') {
      return res.status(400).json({ error: 'Password reset not requested' });
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.status = 'approved';
    await user.save();

    await ActivityLog.create({
      userId: user.id || user._id,
      username: user.username,
      action: 'password_changed',
      details: { method: 'admin_reset' },
    });

    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error during password reset' });
  }
});

// POST /api/auth/reset-admin - Reset admin0 password to "admin"
router.post('/reset-admin', async (req, res) => {
  try {
    const admin0 = await User.findOne({ role: 'admin0' });
    if (!admin0) {
      return res.status(404).json({ error: 'Admin0 not found' });
    }
    const hash = await bcrypt.hash('admin', 10);
    admin0.passwordHash = hash;
    admin0.status = 'approved';
    await admin0.save();
    res.json({ message: 'Admin0 password reset to: admin' });
  } catch (err) {
    console.error('Reset admin error:', err);
    res.status(500).json({ error: 'Server error during admin reset' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  res.json({ user: req.user.toJSON() });
});

module.exports = router;
