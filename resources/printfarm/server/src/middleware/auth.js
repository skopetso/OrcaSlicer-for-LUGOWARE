const jwt = require('jsonwebtoken');
const { User } = require('../db');

// Verify JWT token
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: 'Authentication error' });
  }
};

// Require admin, super_admin, or admin0 role
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin0') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// Require super_admin or admin0 role
const requireSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'admin0') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
};

// Require admin0 role
const requireAdmin0 = (req, res, next) => {
  if (req.user.role !== 'admin0') {
    return res.status(403).json({ error: 'Admin0 access required' });
  }
  next();
};

module.exports = { authenticate, requireAdmin, requireSuperAdmin, requireAdmin0 };
