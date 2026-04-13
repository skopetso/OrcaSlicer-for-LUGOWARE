const express = require('express');
const bcrypt = require('bcryptjs');
const { Farm, ActivityLog } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/farms - List farms
router.get('/', authenticate, async (req, res) => {
  try {
    let farms;
    if (req.user.role === 'admin' || req.user.role === 'super_admin') {
      farms = await Farm.find().sort({ order: 1, createdAt: -1 });
    } else {
      // Regular users see all farms (access is controlled by password)
      farms = await Farm.find().sort({ order: 1, createdAt: -1 });
    }
    res.json({ farms });
  } catch (err) {
    console.error('List farms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/farms - Create farm (admin/super_admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, accessPassword, adminPassword } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Farm name is required' });
    }
    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin password is required' });
    }

    const hashedAdminPassword = await bcrypt.hash(adminPassword, 10);
    const hashedAccessPassword = accessPassword ? await bcrypt.hash(accessPassword, 10) : null;

    const farm = await Farm.createNew({
      name,
      accessPassword: hashedAccessPassword,
      adminPassword: hashedAdminPassword,
      createdBy: req.user.id || req.user.id || req.user._id,
    });

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'farm_created',
      details: { farmName: name },
      farmId: farm.id || farm._id,
    });

    res.status(201).json({ farm: farm.toJSON() });
  } catch (err) {
    console.error('Create farm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/farms/reorder - Reorder farms
router.put('/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { farmIds } = req.body;
    if (!Array.isArray(farmIds)) {
      return res.status(400).json({ error: 'farmIds must be an array' });
    }
    for (let i = 0; i < farmIds.length; i++) {
      await Farm.findByIdAndUpdate(farmIds[i], { order: i });
    }
    res.json({ message: 'Farms reordered' });
  } catch (err) {
    console.error('Reorder farms error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/farms/logs?farmId= - Get activity logs (admin only)
router.get('/logs', authenticate, requireAdmin, async (req, res) => {
  try {
    const logs = await ActivityLog.find();
    const all = Array.isArray(logs) ? logs : [];
    const farmId = req.query.farmId;
    const noInventory = all.filter(l => !l.action.includes('inventory'));
    const filtered = farmId ? noInventory.filter(l => l.farmId === farmId || !l.farmId) : noInventory;
    res.json({ logs: filtered.slice(0, 200) });
  } catch (err) {
    console.error('Get logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/farms/logs - Record activity log from frontend
router.post('/logs', authenticate, async (req, res) => {
  try {
    const { action, details, farmId } = req.body;
    if (!action) return res.status(400).json({ error: 'Action required' });
    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action,
      details: details || null,
      farmId: farmId || null,
    });
    res.json({ message: 'Logged' });
  } catch (err) {
    console.error('Log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/farms/:id - Update farm
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const { name, accessPassword, adminPassword } = req.body;

    if (name !== undefined) farm.name = name;
    if (accessPassword !== undefined) {
      farm.accessPassword = accessPassword ? await bcrypt.hash(accessPassword, 10) : null;
    }
    if (adminPassword !== undefined) {
      farm.adminPassword = await bcrypt.hash(adminPassword, 10);
    }

    await farm.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'farm_updated',
      details: { farmName: farm.name },
      farmId: farm.id || farm._id,
    });

    res.json({ farm: farm.toJSON() });
  } catch (err) {
    console.error('Update farm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/farms/:id - Delete farm (requires admin password verification)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const { adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin password is required to delete a farm' });
    }

    const valid = await bcrypt.compare(adminPassword, farm.adminPassword);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }

    await Farm.findByIdAndDelete(req.params.id);

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'farm_deleted',
      details: { farmName: farm.name },
      farmId: farm.id || farm._id,
    });

    res.json({ message: 'Farm deleted' });
  } catch (err) {
    console.error('Delete farm error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/farms/:id/verify-admin - Verify farm admin password
router.post('/:id/verify-admin', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }
    const { adminPassword } = req.body;
    if (!adminPassword) {
      return res.status(400).json({ error: 'Admin password is required' });
    }
    const valid = await bcrypt.compare(adminPassword, farm.adminPassword);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid admin password' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Verify admin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/farms/:id/access - Verify farm access password
router.post('/:id/access', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    // If no access password set, allow access
    if (!farm.accessPassword) {
      return res.json({ success: true });
    }

    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    console.log('[ACCESS DEBUG] password:', password, 'stored hash:', farm.accessPassword);
    const valid = await bcrypt.compare(password, farm.accessPassword);
    console.log('[ACCESS DEBUG] bcrypt result:', valid);
    if (!valid) {
      return res.status(403).json({ error: 'Invalid access password' });
    }

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'farm_accessed',
      details: { farmName: farm.name },
      farmId: farm.id || farm._id,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Farm access error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/farms/:id/reset-passwords - Reset farm passwords with reset code
router.post('/:id/reset-passwords', async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const { accessPassword, adminPassword, resetCode } = req.body;

    if (!resetCode) {
      return res.status(400).json({ error: 'Reset code is required' });
    }

    if (resetCode !== 'huhn') {
      return res.status(403).json({ error: 'Invalid reset code' });
    }

    if (!accessPassword && !adminPassword) {
      return res.status(400).json({ error: 'At least one password must be provided' });
    }

    if (accessPassword !== undefined) {
      farm.accessPassword = accessPassword ? await bcrypt.hash(accessPassword, 10) : null;
    }
    if (adminPassword) {
      farm.adminPassword = await bcrypt.hash(adminPassword, 10);
    }

    await farm.save();

    // Log without userId since this is a reset code operation
    try {
      await ActivityLog.create({
        userId: farm.createdBy,
        username: 'RESET_CODE',
        action: 'farm_passwords_reset',
        details: {
          farmName: farm.name,
          accessPasswordChanged: accessPassword !== undefined,
          adminPasswordChanged: !!adminPassword,
          method: 'reset_code',
        },
        farmId: farm.id || farm._id,
      });
    } catch { /* ignore log error */ }

    res.json({ message: 'Farm passwords reset successfully' });
  } catch (err) {
    console.error('Reset farm passwords error:', err);
    res.status(500).json({ error: 'Server error during password reset' });
  }
});

// GET /api/farms/:id/printers - Get printers for farm
router.get('/:id/printers', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    res.json({ printers: farm.printers });
  } catch (err) {
    console.error('Get printers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/farms/:id/printers - Update printers for farm
router.put('/:id/printers', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const { printers } = req.body;
    if (!Array.isArray(printers)) {
      return res.status(400).json({ error: 'Printers must be an array' });
    }

    // Check for duplicate IPs across all farms
    const newIps = printers.filter(p => p.ip).map(p => p.ip);
    if (newIps.length > 0) {
      const allFarms = await Farm.find();
      const duplicateIp = newIps.find(ip => {
        // Check duplicates within this request
        if (newIps.filter(i => i === ip).length > 1) return true;
        // Check duplicates in other farms
        return allFarms.some(f => {
          if ((f.id || f._id).toString() === req.params.id) return false;
          return (f.printers || []).some(p => p.ip === ip);
        });
      });
      if (duplicateIp) {
        return res.status(400).json({ error: `IP ${duplicateIp} is already in use by another printer` });
      }
    }

    farm.printers = printers;
    await farm.save();

    await ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'printers_updated',
      details: { farmName: farm.name, printerCount: printers.length },
      farmId: farm.id || farm._id,
    });

    res.json({ printers: farm.printers });
  } catch (err) {
    console.error('Update printers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/farms/:id/inventory - Get inventory
router.get('/:id/inventory', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    res.json({ inventory: farm.inventory });
  } catch (err) {
    console.error('Get inventory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/farms/:id/inventory - Update inventory
router.put('/:id/inventory', authenticate, async (req, res) => {
  try {
    const farm = await Farm.findById(req.params.id);
    if (!farm) {
      return res.status(404).json({ error: 'Farm not found' });
    }

    const { inventory } = req.body;
    if (!Array.isArray(inventory)) {
      return res.status(400).json({ error: 'Inventory must be an array' });
    }

    farm.inventory = inventory;
    await farm.save();

    res.json({ inventory: farm.inventory });
  } catch (err) {
    console.error('Update inventory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
