const path = require('path');
const farmAppdata = process.env.FARM_APPDATA || '';
if (farmAppdata) {
  const fs = require('fs');
  if (!fs.existsSync(farmAppdata)) fs.mkdirSync(farmAppdata, { recursive: true });
  require('dotenv').config({ path: path.join(farmAppdata, '.env') });
  process.env.SQLITE_PATH = path.join(farmAppdata, 'data.db');
} else {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}
const express = require('express');
const cors = require('cors');
const { connectDb } = require('./db');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const farmRoutes = require('./routes/farms');
const postRoutes = require('./routes/posts');
const inventoryRoutes = require('./routes/inventory');
const webcamRoutes = require('./routes/webcam');
const storageRoutes = require('./routes/storage');
const managementRoutes = require('./routes/management');
const scheduleRoutes = require('./routes/schedules');

const app = express();
const PORT = process.env.PORT || 46259;

// Middleware
app.use(cors());
app.use((req, res, next) => {
  express.json()(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    next();
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/farms', farmRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/webcam', webcamRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/management', managementRoutes);
app.use('/api/schedules', scheduleRoutes);

// License mode API
app.get('/api/settings/mode', (req, res) => {
  const { getDb } = require('./db/sqlite-init');
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'license_mode'").get();
  res.json({ mode: row ? row.value : 'personal' });
});

app.put('/api/settings/license', require('./middleware/auth').authenticate, require('./middleware/auth').requireAdmin0, (req, res) => {
  const { getDb } = require('./db/sqlite-init');
  const crypto = require('crypto');
  const db = getDb();
  const { key } = req.body;

  const LICENSE_SECRET = 'LuGoWaRe-3dPrInT-2026-sEcReT-kEy';
  const inputKey = key.replace(/[\s-]/g, '').toUpperCase();

  if (inputKey.length !== 9) {
    return res.status(400).json({ error: 'Invalid license key' });
  }

  // Key format: SSSSSCCCC (serial 5 + sig 4)
  const serial = inputKey.slice(0, 5);
  const sig = inputKey.slice(5, 9);

  // Try permanent
  const permPayload = `E:99999999:${serial}`;
  const permSig = crypto.createHmac('sha256', LICENSE_SECRET).update(permPayload).digest('hex').slice(0, 4).toUpperCase();
  if (sig === permSig) {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_mode', 'enterprise')").run();
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(key);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_expiry', 'permanent')").run();
    return res.json({ mode: 'enterprise', message: 'License activated' });
  }

  // Try date-based (all dates in next 10 years)
  const now = new Date();
  for (let y = now.getFullYear(); y <= now.getFullYear() + 10; y++) {
    for (let m = 1; m <= 12; m++) {
      const daysInMonth = new Date(y, m, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateCode = `${y}${String(m).padStart(2,'0')}${String(d).padStart(2,'0')}`;
        const datePayload = `E:${dateCode}:${serial}`;
        const dateSig = crypto.createHmac('sha256', LICENSE_SECRET).update(datePayload).digest('hex').slice(0, 4).toUpperCase();
        if (sig === dateSig) {
          const expiryDate = new Date(`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`);
          if (expiryDate < now) {
            return res.status(400).json({ error: 'License key expired' });
          }
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_mode', 'enterprise')").run();
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_key', ?)").run(key);
          db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('license_expiry', ?)").run(expiryDate.toISOString().slice(0,10));
          return res.json({ mode: 'enterprise', message: 'License activated' });
        }
      }
    }
  }

  res.status(400).json({ error: 'Invalid license key' });
});

// Background image upload/serve
const multerBg = require('multer');
const bgUpload = multerBg({
  storage: multerBg.diskStorage({
    destination: (req, file, cb) => {
      const { getDb } = require('./db/sqlite-init');
      const db = getDb();
      const row = db.prepare("SELECT value FROM settings WHERE key = 'storage_path'").get();
      const storagePath = row ? row.value : path.join(__dirname, '..', 'bg');
      const bgDir = path.join(storagePath, '.background');
      if (!require('fs').existsSync(bgDir)) require('fs').mkdirSync(bgDir, { recursive: true });
      cb(null, bgDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      const type = req.query.type || 'main';
      cb(null, `background_${type}${ext}`);
    },
  }),
});

app.post('/api/background', require('./middleware/auth').authenticate, bgUpload.single('image'), (req, res) => {
  // Check admin0 only
  if (req.user.role !== 'admin0') return res.status(403).json({ error: 'Admin0 only' });
  if (!req.file) return res.status(400).json({ error: 'No image' });
  const type = req.query.type || 'main';
  const { getDb } = require('./db/sqlite-init');
  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(`background_${type}`, req.file.filename);
  res.json({ filename: req.file.filename });
});

app.get('/api/background', (req, res) => {
  const type = req.query.type || 'main';
  const { getDb } = require('./db/sqlite-init');
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(`background_${type}`);
  if (!row) return res.status(204).end();
  const storageRow = db.prepare("SELECT value FROM settings WHERE key = 'storage_path'").get();
  const storagePath = storageRow ? storageRow.value : path.join(__dirname, '..', 'bg');
  const bgPath = path.join(storagePath, '.background', row.value);
  if (!require('fs').existsSync(bgPath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(bgPath);
});

app.delete('/api/background', require('./middleware/auth').authenticate, (req, res) => {
  if (req.user.role !== 'admin0') return res.status(403).json({ error: 'Admin0 only' });
  const { getDb } = require('./db/sqlite-init');
  const db = getDb();
  const type = req.query.type || 'main';
  db.prepare("DELETE FROM settings WHERE key = ?").run(`background_${type}`);
  res.json({ message: 'Background removed' });
});

// Proxy: get print_settings_id from printer's gcode file
app.get('/api/printer/:ip/process-preset', async (req, res) => {
  try {
    const { ip } = req.params;
    const { filename } = req.query;
    if (!filename) return res.status(400).json({ error: 'filename required' });
    const response = await fetch(`http://${ip}/server/files/gcodes/${encodeURIComponent(filename)}`, {
      headers: { Range: 'bytes=-50000' }
    });
    if (!response.ok) return res.json({ preset: null });
    const text = await response.text();
    const match = text.match(/;\s*print_settings_id\s*=\s*(.+)/);
    res.json({ preset: match ? match[1].trim() : null });
  } catch {
    res.json({ preset: null });
  }
});

// Serve frontend static files
const frontendPath = path.join(__dirname, '..', 'dist');
const fs = require('fs');
if (fs.existsSync(frontendPath)) {
  app.use(express.static(frontendPath));
}

// Health check
app.get('/api/health', (req, res) => {
  const os = require('os');
  const nets = os.networkInterfaces();
  let localIp = '';
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) { localIp = net.address; break; }
    }
    if (localIp) break;
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: 'sqlite', ip: localIp, port: PORT });
});

// TEMP: Reset DB (remove this in production!)
app.post('/api/reset-db', async (req, res) => {
  const { getDb } = require('./db/sqlite-init');
  const db = getDb();
  db.exec('DELETE FROM inventory_logs; DELETE FROM global_inventory; DELETE FROM activity_logs; DELETE FROM posts; DELETE FROM printer_tools; DELETE FROM farm_printers; DELETE FROM farm_inventory; DELETE FROM farms; DELETE FROM users;');
  res.json({ message: 'Database cleared' });
});

// SPA fallback: serve index.html for non-API routes
if (fs.existsSync(frontendPath)) {
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to DB and start server
connectDb()
  .then(() => {
    app.listen(PORT, () => {
      const os = require('os');
      const nets = os.networkInterfaces();
      let localIp = '';
      for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
          if (net.family === 'IPv4' && !net.internal) {
            localIp = net.address;
            break;
          }
        }
        if (localIp) break;
      }
      console.log(`Server running on port ${PORT} (SQLite)`);
      console.log('');
      console.log(`  Local:   http://localhost:${PORT}`);
      if (localIp) console.log(`  Network: http://${localIp}:${PORT}`);
      console.log('');
    });
  })
  .catch((err) => {
    console.error('Database connection error:', err);
    process.exit(1);
  });
