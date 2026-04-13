const { getDb, generateId } = require('./sqlite-init');

// ─── Helper ───
function rowToJson(row, excludeFields = []) {
  if (!row) return null;
  const obj = { ...row, id: row.id };
  delete obj._id;
  for (const f of excludeFields) delete obj[f];
  return obj;
}

// Mongoose-like chainable query that also works with await
function chainable(rows) {
  const result = {
    sort: () => chainable(rows),
    limit: () => chainable(rows),
    then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
  };
  return result;
}

// ─── User ───
const User = {
  async countDocuments(filter = {}) {
    const db = getDb();
    if (filter.role) {
      return db.prepare('SELECT COUNT(*) as c FROM users WHERE role = ?').get(filter.role).c;
    }
    return db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  },

  async findOne(filter) {
    const db = getDb();
    if (filter.username) {
      const row = db.prepare('SELECT * FROM users WHERE username = ?').get(filter.username);
      return row ? userDoc(row) : null;
    }
    return null;
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return row ? userDoc(row) : null;
  },

  find() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
    return chainable(rows.map(r => userDoc(r)));
  },

  async findByIdAndDelete(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    if (row) db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return row ? userDoc(row) : null;
  },
};

function userDoc(row) {
  const doc = { ...row };
  doc.save = async function () {
    const db = getDb();
    db.prepare('UPDATE users SET username=?, passwordHash=?, role=?, status=?, createdBy=? WHERE id=?')
      .run(doc.username, doc.passwordHash, doc.role, doc.status || 'approved', doc.createdBy, doc.id);
    return doc;
  };
  doc.toJSON = function () {
    return rowToJson(doc, ['passwordHash']);
  };
  return doc;
}

User.createNew = async function (data) {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO users (id, username, passwordHash, role, status, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, data.username, data.passwordHash, data.role || 'user', data.status || 'approved', data.createdBy || null, now);
  return userDoc({ id, ...data, createdAt: now });
};

// ─── Farm ───
const Farm = {
  find() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM farms ORDER BY "order" ASC, createdAt DESC').all();
    return chainable(rows.map(r => farmDoc(r)));
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM farms WHERE id = ?').get(id);
    return row ? farmDoc(row) : null;
  },

  async findByIdAndUpdate(id, update) {
    const db = getDb();
    if (update.order !== undefined) {
      db.prepare('UPDATE farms SET "order"=? WHERE id=?').run(update.order, id);
    }
    if (update.name !== undefined) {
      db.prepare('UPDATE farms SET name=? WHERE id=?').run(update.name, id);
    }
    return Farm.findById(id);
  },

  async findByIdAndDelete(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM farms WHERE id = ?').get(id);
    if (row) db.prepare('DELETE FROM farms WHERE id = ?').run(id);
    return row ? farmDoc(row) : null;
  },
};

Farm.createNew = async function (data) {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO farms (id, name, "order", accessPassword, adminPassword, createdBy, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, data.name, data.order || 0, data.accessPassword || null, data.adminPassword, data.createdBy, now);
  return farmDoc({ id, name: data.name, order: data.order || 0, accessPassword: data.accessPassword || null, adminPassword: data.adminPassword, createdBy: data.createdBy, createdAt: now });
};

function farmDoc(row) {
  const doc = { ...row };
  const db = getDb();

  // Load printers
  const printers = db.prepare('SELECT * FROM farm_printers WHERE farmId = ? ORDER BY "order" ASC').all(doc.id);
  doc.printers = printers.map(p => {
    const tools = db.prepare('SELECT * FROM printer_tools WHERE printerId = ?').all(p.id);
    return { ...p, _id: p.id, toolConfig: tools.map(t => ({ ...t, _id: t.id })) };
  });

  // Load inventory
  const inv = db.prepare('SELECT * FROM farm_inventory WHERE farmId = ? ORDER BY "order" ASC').all(doc.id);
  doc.inventory = inv.map(i => ({ ...i, _id: i.id }));

  doc.save = async function () {
    const db = getDb();
    db.prepare('UPDATE farms SET name=?, "order"=?, accessPassword=?, adminPassword=? WHERE id=?')
      .run(doc.name, doc.order || 0, doc.accessPassword, doc.adminPassword, doc.id);

    // Sync printers
    db.prepare('DELETE FROM printer_tools WHERE printerId IN (SELECT id FROM farm_printers WHERE farmId = ?)').run(doc.id);
    db.prepare('DELETE FROM farm_printers WHERE farmId = ?').run(doc.id);
    if (doc.printers && doc.printers.length > 0) {
      const insertPrinter = db.prepare('INSERT INTO farm_printers (id, farmId, number, ip, manualStatus, "order") VALUES (?,?,?,?,?,?)');
      const insertTool = db.prepare('INSERT INTO printer_tools (id, printerId, nozzle, filament) VALUES (?,?,?,?)');
      for (const p of doc.printers) {
        const pid = p._id || p.id || generateId();
        insertPrinter.run(pid, doc.id, p.number, p.ip || '', p.manualStatus || null, p.order || 0);
        if (p.toolConfig) {
          for (const t of p.toolConfig) {
            insertTool.run(t._id || t.id || generateId(), pid, t.nozzle || '', t.filament || '');
          }
        }
      }
    }

    // Sync inventory
    db.prepare('DELETE FROM farm_inventory WHERE farmId = ?').run(doc.id);
    if (doc.inventory && doc.inventory.length > 0) {
      const insertInv = db.prepare('INSERT INTO farm_inventory (id, farmId, name, quantity, "order") VALUES (?,?,?,?,?)');
      for (const i of doc.inventory) {
        insertInv.run(i._id || i.id || generateId(), doc.id, i.name, i.quantity || 0, i.order || 0);
      }
    }

    return doc;
  };

  doc.toJSON = function () {
    return rowToJson(doc, ['accessPassword', 'adminPassword']);
  };

  return doc;
}

// ─── Post ───
const Post = {
  find(filter = {}) {
    const db = getDb();
    let rows;
    if (filter.board) {
      rows = db.prepare('SELECT * FROM posts WHERE board = ? ORDER BY createdAt DESC').all(filter.board);
    } else {
      rows = db.prepare('SELECT * FROM posts ORDER BY createdAt DESC').all();
    }
    return chainable(rows.map(r => postDoc(r)));
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    return row ? postDoc(row) : null;
  },

  async findByIdAndDelete(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (row) db.prepare('DELETE FROM posts WHERE id = ?').run(id);
    return row ? postDoc(row) : null;
  },
};

Post.createNew = async function (data) {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO posts (id, title, content, author, authorId, board, createdAt) VALUES (?,?,?,?,?,?,?)')
    .run(id, data.title, data.content, data.author, data.authorId, data.board, now);
  return postDoc({ id, ...data, createdAt: now });
};

function postDoc(row) {
  const doc = { ...row };
  doc.save = async function () {
    const db = getDb();
    db.prepare('UPDATE posts SET title=?, content=?, author=?, authorId=?, board=? WHERE id=?')
      .run(doc.title, doc.content, doc.author, doc.authorId, doc.board, doc.id);
    return doc;
  };
  doc.toJSON = function () { return rowToJson(doc); };
  return doc;
}

// ─── ActivityLog ───
const ActivityLog = {
  async create(data) {
    const db = getDb();
    const now = new Date().toISOString();
    const details = data.details ? JSON.stringify(data.details) : null;

    // Skip duplicate: same user + action + details within 3 seconds
    const recent = db.prepare(
      "SELECT timestamp FROM activity_logs WHERE userId = ? AND action = ? AND details IS ? ORDER BY timestamp DESC LIMIT 1"
    ).get(data.userId, data.action, details);
    if (recent) {
      const diff = new Date(now).getTime() - new Date(recent.timestamp).getTime();
      if (diff < 3000) return { id: '', ...data, timestamp: now };
    }

    const id = generateId();
    db.prepare('INSERT INTO activity_logs (id, userId, username, action, details, farmId, timestamp) VALUES (?,?,?,?,?,?,?)')
      .run(id, data.userId, data.username, data.action, details, data.farmId || null, now);
    return { id, ...data, timestamp: now };
  },

  async find(filter = {}) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC').all();
    return rows.map(r => {
      if (r.details) r.details = JSON.parse(r.details);
      return r;
    });
  },
};

// ─── GlobalInventory ───
const GlobalInventory = {
  find() {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM global_inventory ORDER BY "order" ASC').all();
    return chainable(rows.map(r => globalInvDoc(r)));
  },

  findOne() {
    const db = getDb();
    const row = db.prepare('SELECT * FROM global_inventory ORDER BY "order" DESC LIMIT 1').get();
    const result = row ? globalInvDoc(row) : null;
    return { sort: () => result, then: (resolve, reject) => Promise.resolve(result).then(resolve, reject) };
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM global_inventory WHERE id = ?').get(id);
    return row ? globalInvDoc(row) : null;
  },

  async findByIdAndUpdate(id, update) {
    const db = getDb();
    if (update.order !== undefined) {
      db.prepare('UPDATE global_inventory SET "order"=? WHERE id=?').run(update.order, id);
    }
    return GlobalInventory.findById(id);
  },

  async findByIdAndDelete(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM global_inventory WHERE id = ?').get(id);
    if (row) db.prepare('DELETE FROM global_inventory WHERE id = ?').run(id);
    return row ? globalInvDoc(row) : null;
  },
};

GlobalInventory.createNew = async function (data) {
  const db = getDb();
  const id = generateId();
  db.prepare('INSERT INTO global_inventory (id, name, quantity, "order") VALUES (?,?,?,?)')
    .run(id, data.name, data.quantity || 0, data.order || 0);
  return globalInvDoc({ id, name: data.name, quantity: data.quantity || 0, order: data.order || 0 });
};

function globalInvDoc(row) {
  const doc = { ...row };
  doc.save = async function () {
    const db = getDb();
    db.prepare('UPDATE global_inventory SET name=?, quantity=?, "order"=? WHERE id=?')
      .run(doc.name, doc.quantity, doc.order || 0, doc.id);
    return doc;
  };
  doc.toJSON = function () { return rowToJson(doc); };
  return doc;
}

// ─── InventoryLog ───
const InventoryLog = {
  find(filter = {}) {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM inventory_logs ORDER BY createdAt DESC LIMIT 100').all();
    return chainable(rows.map(r => invLogDoc(r)));
  },

  async create(data) {
    const db = getDb();
    const id = generateId();
    const now = new Date().toISOString();
    db.prepare('INSERT INTO inventory_logs (id, itemId, itemName, action, oldValue, newValue, username, createdAt) VALUES (?,?,?,?,?,?,?,?)')
      .run(id, data.itemId, data.itemName, data.action, data.oldValue ?? null, data.newValue ?? null, data.username, now);
    return invLogDoc({ id, ...data, createdAt: now });
  },
};

InventoryLog.createNew = async function (data) {
  return InventoryLog.create(data);
};

function invLogDoc(row) {
  const doc = { ...row };
  doc.save = async function () { return doc; };
  doc.toJSON = function () { return rowToJson(doc); };
  return doc;
}

// ─── Schedule ───
const Schedule = {
  find(filter = {}) {
    const db = getDb();
    let sql = 'SELECT * FROM schedules';
    const params = [];
    if (filter.startDate && filter.endDate) {
      sql += ' WHERE endDate >= ? AND startDate <= ?';
      params.push(filter.startDate, filter.endDate);
    }
    sql += ' ORDER BY startDate ASC';
    const rows = db.prepare(sql).all(...params);
    return chainable(rows.map(r => scheduleDoc(r)));
  },

  async findById(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    return row ? scheduleDoc(row) : null;
  },

  async findByIdAndDelete(id) {
    const db = getDb();
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    if (row) db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    return row ? scheduleDoc(row) : null;
  },
};

Schedule.createNew = async function (data) {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO schedules (id, title, description, startDate, endDate, color, createdBy, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, data.title, data.description || '', data.startDate, data.endDate, data.color || '#3b82f6', data.createdBy, now, now);
  return scheduleDoc({ id, title: data.title, description: data.description || '', startDate: data.startDate, endDate: data.endDate, color: data.color || '#3b82f6', createdBy: data.createdBy, createdAt: now, updatedAt: now });
};

function scheduleDoc(row) {
  const doc = { ...row };
  doc.save = async function () {
    const db = getDb();
    const now = new Date().toISOString();
    db.prepare('UPDATE schedules SET title=?, description=?, startDate=?, endDate=?, color=?, updatedAt=? WHERE id=?')
      .run(doc.title, doc.description, doc.startDate, doc.endDate, doc.color, now, doc.id);
    doc.updatedAt = now;
    return doc;
  };
  doc.toJSON = function () { return rowToJson(doc); };
  return doc;
}

module.exports = { User, Farm, Post, ActivityLog, GlobalInventory, InventoryLog, Schedule };
