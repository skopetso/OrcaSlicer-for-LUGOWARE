const express = require('express');
const { GlobalInventory, InventoryLog } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/inventory - List all items, sorted by order asc
router.get('/', authenticate, async (req, res) => {
  try {
    const items = await GlobalInventory.find().sort({ order: 1 });
    res.json({ items });
  } catch (err) {
    console.error('List global inventory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/inventory - Add item (admin only)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, quantity } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Item name is required' });
    }

    // Auto-set order to max + 1
    const maxItem = await GlobalInventory.findOne().sort({ order: -1 });
    const order = maxItem ? maxItem.order + 1 : 0;

    const item = await GlobalInventory.createNew({ name, quantity, order });

    await InventoryLog.createNew({
      itemId: item.id || item._id,
      itemName: item.name,
      action: 'add',
      newValue: quantity || 0,
      username: req.user.username,
    });

    res.status(201).json({ item: item.toJSON() });
  } catch (err) {
    console.error('Create global inventory item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/inventory/logs - Get inventory change logs
router.get('/logs', authenticate, async (req, res) => {
  try {
    const logs = await InventoryLog.find().sort({ createdAt: -1 }).limit(100);
    res.json({ logs });
  } catch (err) {
    console.error('Get inventory logs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/inventory/reorder - Reorder items (admin only)
router.put('/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const { itemIds } = req.body;
    if (!Array.isArray(itemIds)) {
      return res.status(400).json({ error: 'itemIds must be an array' });
    }
    for (let i = 0; i < itemIds.length; i++) {
      await GlobalInventory.findByIdAndUpdate(itemIds[i], { order: i });
    }
    res.json({ message: 'Inventory reordered' });
  } catch (err) {
    console.error('Reorder global inventory error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/inventory/:id - Update item (qty: any user, name/order: admin only)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const item = await GlobalInventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const { name, quantity, order } = req.body;
    const oldQty = item.quantity;
    const isAdmin = ['admin0', 'super_admin', 'admin'].includes(req.user.role);

    // Name and order changes require admin
    if ((name !== undefined || order !== undefined) && !isAdmin) {
      return res.status(403).json({ error: 'Admin required for name/order changes' });
    }

    if (name !== undefined) item.name = name;
    if (quantity !== undefined) item.quantity = quantity;
    if (order !== undefined) item.order = order;

    await item.save();

    // Log quantity change
    if (quantity !== undefined && quantity !== oldQty) {
      await InventoryLog.createNew({
        itemId: item.id || item._id,
        itemName: item.name,
        action: 'update_qty',
        oldValue: oldQty,
        newValue: quantity,
        username: req.user.username,
      });
    }

    res.json({ item: item.toJSON() });
  } catch (err) {
    console.error('Update global inventory item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/inventory/:id - Delete item (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const item = await GlobalInventory.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await InventoryLog.createNew({
      itemId: item.id || item._id,
      itemName: item.name,
      action: 'delete',
      oldValue: item.quantity,
      username: req.user.username,
    });

    await GlobalInventory.findByIdAndDelete(req.params.id);

    res.json({ message: 'Item deleted' });
  } catch (err) {
    console.error('Delete global inventory item error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
