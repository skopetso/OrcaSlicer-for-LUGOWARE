/**
 * DB Layer - SQLite (better-sqlite3)
 *
 * Usage: const { User, Farm, Post, ActivityLog, GlobalInventory, InventoryLog } = require('./db');
 */

const models = require('./sqlite-models');

module.exports = {
  ...models,
  async connectDb() {
    const { getDb } = require('./sqlite-init');
    getDb();
    console.log('Connected to SQLite');
  },
};
