const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getDb, generateId } = require('../db/sqlite-init');

// All management routes require auth
router.use(authenticate);

// ===== CATEGORIES =====

router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM mgmt_categories ORDER BY "order" ASC, name ASC').all();
  res.json(categories);
});

router.post('/categories', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const id = generateId();
  const maxOrder = db.prepare('SELECT MAX("order") as m FROM mgmt_categories').get();
  db.prepare('INSERT INTO mgmt_categories (id, name, "order") VALUES (?, ?, ?)').run(id, name.trim(), (maxOrder?.m || 0) + 1);
  res.json({ id, name: name.trim() });
});

router.put('/categories/:id', requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  db.prepare('UPDATE mgmt_categories SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
  res.json({ id: req.params.id, name: name.trim() });
});

router.delete('/categories/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM mgmt_categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ===== SUPPLIERS =====

router.get('/suppliers', (req, res) => {
  const db = getDb();
  const suppliers = db.prepare('SELECT * FROM mgmt_suppliers ORDER BY name ASC').all();
  res.json(suppliers);
});

router.post('/suppliers', requireAdmin, (req, res) => {
  const { name, contact, phone, email, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO mgmt_suppliers (id, name, contact, phone, email, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, name.trim(), contact || '', phone || '', email || '', notes || ''
  );
  res.json({ id, name: name.trim() });
});

router.put('/suppliers/:id', requireAdmin, (req, res) => {
  const { name, contact, phone, email, notes } = req.body;
  const db = getDb();
  db.prepare('UPDATE mgmt_suppliers SET name = ?, contact = ?, phone = ?, email = ?, notes = ? WHERE id = ?').run(
    name || '', contact || '', phone || '', email || '', notes || '', req.params.id
  );
  res.json({ message: 'Updated' });
});

router.delete('/suppliers/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM mgmt_suppliers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ===== PARTS =====

router.get('/parts', (req, res) => {
  const db = getDb();
  const { category, search, lowStock } = req.query;

  let sql = `
    SELECT p.*, c.name as categoryName, s.name as supplierName
    FROM mgmt_parts p
    LEFT JOIN mgmt_categories c ON p.categoryId = c.id
    LEFT JOIN mgmt_suppliers s ON p.supplierId = s.id
    WHERE 1=1
  `;
  const params = [];

  if (category) {
    sql += ' AND p.categoryId = ?';
    params.push(category);
  }
  if (search) {
    sql += ' AND (p.name LIKE ? OR p.notes LIKE ? OR p.location LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (lowStock === 'true') {
    sql += ' AND p.currentQuantity <= p.minQuantity AND p.minQuantity > 0';
  }

  sql += ' ORDER BY p.name ASC';
  const parts = db.prepare(sql).all(...params);
  res.json(parts);
});

router.post('/parts', requireAdmin, (req, res) => {
  const { name, categoryId, unit, minQuantity, currentQuantity, supplierId, location, notes } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const db = getDb();
  const id = generateId();
  db.prepare(`
    INSERT INTO mgmt_parts (id, name, categoryId, unit, minQuantity, currentQuantity, supplierId, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name.trim(), categoryId || null, unit || 'ea', minQuantity || 0, currentQuantity || 0, supplierId || null, location || '', notes || '');
  res.json({ id, name: name.trim() });
});

router.put('/parts/:id', requireAdmin, (req, res) => {
  const { name, categoryId, unit, minQuantity, currentQuantity, supplierId, location, notes } = req.body;
  const db = getDb();
  db.prepare(`
    UPDATE mgmt_parts SET name = ?, categoryId = ?, unit = ?, minQuantity = ?, currentQuantity = ?,
    supplierId = ?, location = ?, notes = ?, updatedAt = datetime('now')
    WHERE id = ?
  `).run(name || '', categoryId || null, unit || 'ea', minQuantity || 0, currentQuantity || 0, supplierId || null, location || '', notes || '', req.params.id);
  res.json({ message: 'Updated' });
});

router.delete('/parts/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM mgmt_parts WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// Bulk import parts (for Excel import)
router.post('/parts/bulk', requireAdmin, (req, res) => {
  const { parts } = req.body;
  if (!Array.isArray(parts)) return res.status(400).json({ error: 'parts array required' });
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO mgmt_parts (id, name, categoryId, unit, minQuantity, currentQuantity, supplierId, location, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertMany = db.transaction((items) => {
    for (const p of items) {
      insert.run(generateId(), p.name || '', p.categoryId || null, p.unit || 'ea', p.minQuantity || 0, p.currentQuantity || 0, p.supplierId || null, p.location || '', p.notes || '');
    }
  });
  insertMany(parts);
  res.json({ message: `Imported ${parts.length} parts` });
});

// Export all parts (for Excel export)
router.get('/parts/export', (req, res) => {
  const db = getDb();
  const parts = db.prepare(`
    SELECT p.name, c.name as category, p.unit, p.minQuantity, p.currentQuantity,
           s.name as supplier, p.location, p.notes
    FROM mgmt_parts p
    LEFT JOIN mgmt_categories c ON p.categoryId = c.id
    LEFT JOIN mgmt_suppliers s ON p.supplierId = s.id
    ORDER BY c.name ASC, p.name ASC
  `).all();
  res.json(parts);
});

// ===== STOCK MOVEMENTS =====

router.get('/stock-movements', (req, res) => {
  const db = getDb();
  const { partId, limit } = req.query;
  let sql = `
    SELECT m.*, p.name as partName
    FROM mgmt_stock_movements m
    LEFT JOIN mgmt_parts p ON m.partId = p.id
  `;
  const params = [];
  if (partId) {
    sql += ' WHERE m.partId = ?';
    params.push(partId);
  }
  sql += ' ORDER BY m.createdAt DESC';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(parseInt(limit) || 50);
  } else {
    sql += ' LIMIT 200';
  }
  const movements = db.prepare(sql).all(...params);
  res.json(movements);
});

router.post('/stock-movements', requireAdmin, (req, res) => {
  const { partId, type, quantity, reason } = req.body;
  if (!partId || !type || !quantity) return res.status(400).json({ error: 'partId, type, quantity required' });
  if (type !== 'in' && type !== 'out') return res.status(400).json({ error: 'type must be in or out' });
  if (quantity <= 0) return res.status(400).json({ error: 'quantity must be positive' });

  const db = getDb();
  const part = db.prepare('SELECT * FROM mgmt_parts WHERE id = ?').get(partId);
  if (!part) return res.status(404).json({ error: 'Part not found' });

  const newQty = type === 'in' ? part.currentQuantity + quantity : part.currentQuantity - quantity;
  if (newQty < 0) return res.status(400).json({ error: 'Insufficient stock' });

  const id = generateId();
  const txn = db.transaction(() => {
    db.prepare('INSERT INTO mgmt_stock_movements (id, partId, type, quantity, reason, username) VALUES (?, ?, ?, ?, ?, ?)').run(
      id, partId, type, quantity, reason || '', req.user.username
    );
    db.prepare('UPDATE mgmt_parts SET currentQuantity = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(newQty, partId);
  });
  txn();

  res.json({ id, newQuantity: newQty });
});

// ===== ORDERS =====

router.get('/orders', (req, res) => {
  const db = getDb();
  const { status } = req.query;
  let sql = `
    SELECT o.*, p.name as partName, s.name as supplierName
    FROM mgmt_orders o
    LEFT JOIN mgmt_parts p ON o.partId = p.id
    LEFT JOIN mgmt_suppliers s ON o.supplierId = s.id
  `;
  const params = [];
  if (status) {
    sql += ' WHERE o.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY o.createdAt DESC';
  const orders = db.prepare(sql).all(...params);
  res.json(orders);
});

router.post('/orders', requireAdmin, (req, res) => {
  const { partId, supplierId, quantity, notes } = req.body;
  if (!partId || !quantity) return res.status(400).json({ error: 'partId, quantity required' });
  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO mgmt_orders (id, partId, supplierId, quantity, orderedBy, notes) VALUES (?, ?, ?, ?, ?, ?)').run(
    id, partId, supplierId || null, quantity, req.user.username, notes || ''
  );
  res.json({ id });
});

router.put('/orders/:id', requireAdmin, (req, res) => {
  const { status, notes } = req.body;
  const db = getDb();
  const order = db.prepare('SELECT * FROM mgmt_orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  if (status) {
    db.prepare('UPDATE mgmt_orders SET status = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(status, req.params.id);
    // If received, auto-add stock
    if (status === 'received' && order.status !== 'received') {
      const part = db.prepare('SELECT * FROM mgmt_parts WHERE id = ?').get(order.partId);
      if (part) {
        const newQty = part.currentQuantity + order.quantity;
        db.prepare('UPDATE mgmt_parts SET currentQuantity = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(newQty, order.partId);
        db.prepare('INSERT INTO mgmt_stock_movements (id, partId, type, quantity, reason, username) VALUES (?, ?, ?, ?, ?, ?)').run(
          generateId(), order.partId, 'in', order.quantity, `Order ${req.params.id} received`, req.user.username
        );
      }
    }
  }
  if (notes !== undefined) {
    db.prepare('UPDATE mgmt_orders SET notes = ?, updatedAt = datetime(\'now\') WHERE id = ?').run(notes, req.params.id);
  }
  res.json({ message: 'Updated' });
});

router.delete('/orders/:id', requireAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM mgmt_orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Deleted' });
});

// ===== DASHBOARD STATS =====

router.get('/stats', (req, res) => {
  const db = getDb();
  const totalParts = db.prepare('SELECT COUNT(*) as count FROM mgmt_parts').get().count;
  const lowStock = db.prepare('SELECT COUNT(*) as count FROM mgmt_parts WHERE currentQuantity <= minQuantity AND minQuantity > 0').get().count;
  const pendingOrders = db.prepare("SELECT COUNT(*) as count FROM mgmt_orders WHERE status = 'pending'").get().count;
  const categories = db.prepare('SELECT COUNT(*) as count FROM mgmt_categories').get().count;
  const suppliers = db.prepare('SELECT COUNT(*) as count FROM mgmt_suppliers').get().count;
  const recentMovements = db.prepare('SELECT COUNT(*) as count FROM mgmt_stock_movements WHERE createdAt >= datetime(\'now\', \'-7 days\')').get().count;
  res.json({ totalParts, lowStock, pendingOrders, categories, suppliers, recentMovements });
});

module.exports = router;
