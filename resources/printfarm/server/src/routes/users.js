const express = require('express');
const { User, ActivityLog } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/users - List all users (admin only)
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/role - Change user role
router.put('/:id/role', authenticate, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    const targetId = req.params.id;

    if (!['admin0', 'super_admin', 'admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Nobody can assign admin0 role
    if (role === 'admin0') {
      return res.status(403).json({ error: 'Cannot assign admin0 role' });
    }

    // Only admin0 can assign/revoke super_admin role
    if (role === 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Only admin0 can assign super_admin role' });
    }

    // super_admin or admin0 can assign admin role
    if (role === 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Only super_admin or admin0 can assign admin role' });
    }

    // Can't demote yourself
    if (targetId === (req.user.id || req.user._id).toString()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // admin0 cannot be demoted by anyone
    if (target.role === 'admin0') {
      return res.status(403).json({ error: 'Cannot modify admin0 role' });
    }

    // Only admin0 can change a super_admin's role
    if (target.role === 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Only admin0 can modify super_admin role' });
    }

    const oldRole = target.role;
    target.role = role;
    await target.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'user_role_changed',
      details: { targetUser: target.username, oldRole, newRole: role },
    });

    res.json({ user: target.toJSON() });
  } catch (err) {
    console.error('Change role error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/users/:id - Delete user account
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const targetId = req.params.id;

    // Can't delete yourself
    if (targetId === (req.user.id || req.user._id).toString()) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }

    const target = await User.findById(targetId);
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // admin0 cannot be deleted by anyone
    if (target.role === 'admin0') {
      return res.status(403).json({ error: 'Cannot delete admin0 account' });
    }

    // Only admin0 can delete super_admin accounts
    if (target.role === 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Only admin0 can delete super_admin accounts' });
    }

    // Only super_admin or admin0 can delete admin accounts
    if (target.role === 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Only super_admin or admin0 can delete admin accounts' });
    }

    await User.findByIdAndDelete(targetId);

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'user_deleted',
      details: { deletedUser: target.username, deletedRole: target.role },
    });

    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/reset-password - Admin resets user password (admin+ only)
router.put('/:id/reset-password', authenticate, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'admin0') return res.status(403).json({ error: 'Cannot reset admin0 password' });

    target.status = 'password_reset';
    await target.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'password_reset_by_admin',
      details: { targetUser: target.username },
    });

    res.json({ message: 'Password reset initiated' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/approve - Approve pending user (admin+ only)
router.put('/:id/approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.status !== 'pending') return res.status(400).json({ error: 'User is not pending' });

    // Personal mode: max 2 approved users (admin0 + 1)
    const { getDb } = require('../db/sqlite-init');
    const db = getDb();
    const licRow = db.prepare("SELECT value FROM settings WHERE key = 'license_mode'").get();
    const licenseMode = licRow ? licRow.value : 'personal';
    if (licenseMode === 'personal') {
      const approvedCount = db.prepare("SELECT COUNT(*) as c FROM users WHERE status = 'approved'").get().c;
      if (approvedCount >= 2) {
        return res.status(403).json({ error: 'PERSONAL_USER_LIMIT' });
      }
    }

    target.status = 'approved';
    await target.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'user_approved',
      details: { approvedUser: target.username },
    });

    res.json({ user: target.toJSON() });
  } catch (err) {
    console.error('Approve user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/users/:id/reject - Reject pending user (admin+ only)
router.put('/:id/reject', authenticate, requireAdmin, async (req, res) => {
  try {
    const target = await User.findById(req.params.id);
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.status !== 'pending') return res.status(400).json({ error: 'User is not pending' });

    target.status = 'rejected';
    await target.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'user_rejected',
      details: { rejectedUser: target.username },
    });

    res.json({ user: target.toJSON() });
  } catch (err) {
    console.error('Reject user error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
