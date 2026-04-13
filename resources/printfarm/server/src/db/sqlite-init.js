const Database = require('better-sqlite3');
const path = require('path');

let db = null;

function getDb() {
  if (db) return db;
  const dbPath = process.env.SQLITE_PATH || path.join(__dirname, '..', '..', 'data.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initTables(db);
  return db;
}

function initTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin0','super_admin','admin','user')),
      status TEXT NOT NULL DEFAULT 'approved',
      createdBy TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS farms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0,
      accessPassword TEXT,
      adminPassword TEXT NOT NULL,
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS farm_printers (
      id TEXT PRIMARY KEY,
      farmId TEXT NOT NULL,
      number INTEGER NOT NULL,
      ip TEXT DEFAULT '',
      manualStatus TEXT CHECK(manualStatus IN ('maintenance','ready',NULL)),
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (farmId) REFERENCES farms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS printer_tools (
      id TEXT PRIMARY KEY,
      printerId TEXT NOT NULL,
      nozzle TEXT DEFAULT '',
      filament TEXT DEFAULT '',
      FOREIGN KEY (printerId) REFERENCES farm_printers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS farm_inventory (
      id TEXT PRIMARY KEY,
      farmId TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (farmId) REFERENCES farms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      authorId TEXT NOT NULL,
      board TEXT NOT NULL CHECK(board IN ('admin','user')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      username TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT,
      farmId TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS global_inventory (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS inventory_logs (
      id TEXT PRIMARY KEY,
      itemId TEXT NOT NULL,
      itemName TEXT NOT NULL,
      action TEXT NOT NULL,
      oldValue INTEGER,
      newValue INTEGER,
      username TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Management: Parts categories
    CREATE TABLE IF NOT EXISTS mgmt_categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      "order" INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Management: Suppliers
    CREATE TABLE IF NOT EXISTS mgmt_suppliers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Management: Parts (600+ items)
    CREATE TABLE IF NOT EXISTS mgmt_parts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      categoryId TEXT,
      unit TEXT NOT NULL DEFAULT 'ea',
      minQuantity INTEGER NOT NULL DEFAULT 0,
      currentQuantity INTEGER NOT NULL DEFAULT 0,
      supplierId TEXT,
      location TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (categoryId) REFERENCES mgmt_categories(id) ON DELETE SET NULL,
      FOREIGN KEY (supplierId) REFERENCES mgmt_suppliers(id) ON DELETE SET NULL
    );

    -- Management: Stock movements (입출고)
    CREATE TABLE IF NOT EXISTS mgmt_stock_movements (
      id TEXT PRIMARY KEY,
      partId TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in','out')),
      quantity INTEGER NOT NULL,
      reason TEXT DEFAULT '',
      username TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (partId) REFERENCES mgmt_parts(id) ON DELETE CASCADE
    );

    -- Management: Purchase orders (주문)
    CREATE TABLE IF NOT EXISTS mgmt_orders (
      id TEXT PRIMARY KEY,
      partId TEXT NOT NULL,
      supplierId TEXT,
      quantity INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ordered','received','cancelled')),
      orderedBy TEXT NOT NULL,
      notes TEXT DEFAULT '',
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (partId) REFERENCES mgmt_parts(id) ON DELETE CASCADE,
      FOREIGN KEY (supplierId) REFERENCES mgmt_suppliers(id) ON DELETE SET NULL
    );
    -- Schedules (calendar events)
    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      startDate TEXT NOT NULL,
      endDate TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      createdBy TEXT NOT NULL,
      createdAt TEXT NOT NULL DEFAULT (datetime('now')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Migration: add status column to users if not exists
  try {
    db.prepare("SELECT status FROM users LIMIT 1").get();
  } catch {
    db.exec("ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'");
  }
}

function generateId() {
  return require('crypto').randomBytes(12).toString('hex');
}

module.exports = { getDb, generateId };
