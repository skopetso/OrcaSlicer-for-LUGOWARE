const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { getDb } = require('../db/sqlite-init');
const { parseGcodeMetadata } = require('../lib/gcode-parser');
const { ActivityLog } = require('../db');

const router = express.Router();

// ─── Helper: get storage path ───
function getStoragePath() {
  const db = getDb();
  const row = db.prepare("SELECT value FROM settings WHERE key = 'storage_path'").get();
  return row ? row.value : null;
}

function ensureStoragePath() {
  const storagePath = getStoragePath();
  if (!storagePath) return null;
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  return storagePath;
}

// ─── Multer setup for file upload ───
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const storagePath = ensureStoragePath();
      if (!storagePath) return cb(new Error('Storage path not configured'));
      const subPath = req.body.path || '';
      const fullPath = subPath ? path.join(storagePath, subPath) : storagePath;
      if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
      cb(null, fullPath);
    },
    filename: (req, file, cb) => {
      // Preserve original filename, decode URI encoding
      const decoded = Buffer.from(file.originalname, 'latin1').toString('utf8');
      cb(null, decoded);
    },
  }),
});

// GET /api/storage/config - Get storage path
router.get('/config', authenticate, (req, res) => {
  const storagePath = getStoragePath();
  res.json({ storagePath: storagePath || '' });
});

// PUT /api/storage/config - Set storage path (admin only)
router.put('/config', authenticate, requireAdmin, (req, res) => {
  const { storagePath } = req.body;
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage path is required' });
  }

  // Validate path exists or can be created
  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }
  } catch {
    return res.status(400).json({ error: 'Invalid path or cannot create directory' });
  }

  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('storage_path', ?)").run(storagePath);
  res.json({ storagePath, message: 'Storage path updated' });
});

// GET /api/storage/files?path= - List files in storage
router.get('/files', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.json({ files: [], dirs: [], configured: false });
  }

  const subPath = (req.query.path || '').toString();
  const fullPath = subPath ? path.join(storagePath, subPath) : storagePath;

  // Security: prevent path traversal
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.json({ files: [], dirs: [] });
  }

  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    const files = [];
    const dirs = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip hidden
      const entryPath = path.join(fullPath, entry.name);
      const stat = fs.statSync(entryPath);

      if (entry.isDirectory()) {
        // Calculate folder size recursively
        let folderSize = 0;
        const calcSize = (dir) => {
          try {
            const items = fs.readdirSync(dir, { withFileTypes: true });
            for (const item of items) {
              const itemPath = path.join(dir, item.name);
              if (item.isFile()) folderSize += fs.statSync(itemPath).size;
              else if (item.isDirectory()) calcSize(itemPath);
            }
          } catch { /* skip */ }
        };
        calcSize(entryPath);
        dirs.push({
          dirname: entry.name,
          modified: stat.mtimeMs / 1000,
          size: folderSize,
        });
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.gcode', '.g', '.gco'].includes(ext)) {
          files.push({
            filename: entry.name,
            modified: stat.mtimeMs / 1000,
            size: stat.size,
            path: subPath ? `${subPath}/${entry.name}` : entry.name,
          });
        }
      }
    }

    // Sort files by modified date (newest first)
    files.sort((a, b) => b.modified - a.modified);
    dirs.sort((a, b) => a.dirname.localeCompare(b.dirname));

    res.json({ files, dirs, configured: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read directory' });
  }
});

// GET /api/storage/search?q= - Search files
router.get('/search', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.json({ files: [] });
  }

  const query = (req.query.q || '').toString().toLowerCase();
  if (!query) return res.json({ files: [] });

  const results = [];

  function searchDir(dir, relPath) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        const fullEntryPath = path.join(dir, entry.name);
        const entryRelPath = relPath ? `${relPath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          searchDir(fullEntryPath, entryRelPath);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.gcode', '.g', '.gco'].includes(ext) && entry.name.toLowerCase().includes(query)) {
            const stat = fs.statSync(fullEntryPath);
            results.push({
              filename: entry.name,
              modified: stat.mtimeMs / 1000,
              size: stat.size,
              path: entryRelPath,
            });
          }
        }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  searchDir(storagePath, '');
  results.sort((a, b) => b.modified - a.modified);
  res.json({ files: results.slice(0, 100) });
});

// GET /api/storage/metadata/:filepath - Get gcode metadata (filament, thumbnail)
router.get('/metadata/*', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage not configured' });
  }

  const filePath = req.params[0];
  const fullPath = path.join(storagePath, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  const meta = parseGcodeMetadata(fullPath);
  res.json(meta);
});

// POST /api/storage/move - Move file to different folder
router.post('/move', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) return res.status(400).json({ error: 'Storage not configured' });

  const { source, dest } = req.body;
  if (!source || dest === undefined) return res.status(400).json({ error: 'source and dest required' });

  const srcFull = path.join(storagePath, source);
  const fileName = path.basename(source);
  const destFull = dest ? path.join(storagePath, dest, fileName) : path.join(storagePath, fileName);

  // Security
  if (!path.resolve(srcFull).startsWith(path.resolve(storagePath)) ||
      !path.resolve(destFull).startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(srcFull)) return res.status(404).json({ error: 'Source not found' });

  // Ensure dest directory exists
  const destDir = path.dirname(destFull);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  try {
    fs.renameSync(srcFull, destFull);
    ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'storage_move',
      details: { source, dest },
    });
    res.json({ message: 'File moved' });
  } catch {
    res.status(500).json({ error: 'Failed to move file' });
  }
});

// PUT /api/storage/rename - Rename a file
router.put('/rename', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) return res.status(400).json({ error: 'Storage not configured' });

  const { oldPath, newPath } = req.body;
  if (!oldPath || !newPath) return res.status(400).json({ error: 'oldPath and newPath required' });

  const oldFull = path.join(storagePath, oldPath);
  const newFull = path.join(storagePath, newPath);

  if (!path.resolve(oldFull).startsWith(path.resolve(storagePath)) ||
      !path.resolve(newFull).startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(oldFull)) return res.status(404).json({ error: 'File not found' });
  if (fs.existsSync(newFull)) return res.status(409).json({ error: 'File already exists' });

  try {
    fs.renameSync(oldFull, newFull);
    ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'storage_rename',
      details: { oldPath, newPath },
    });
    res.json({ message: 'File renamed' });
  } catch {
    res.status(500).json({ error: 'Failed to rename file' });
  }
});

// POST /api/storage/import-from-printer - Copy file from printer to storage
router.post('/import-from-printer', authenticate, async (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) return res.status(400).json({ error: 'Storage not configured' });

  const { printerIp, filePath } = req.body;
  if (!printerIp || !filePath) return res.status(400).json({ error: 'printerIp and filePath required' });

  try {
    const http = require('http');
    const encodedPath = encodeURIComponent(filePath);
    const fileData = await new Promise((resolve, reject) => {
      http.get(`http://${printerIp}/server/files/gcodes/${encodedPath}`, { timeout: 30000 }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });

    const fileName = path.basename(filePath);
    const destPath = path.join(storagePath, fileName);
    fs.writeFileSync(destPath, fileData);
    ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'storage_import',
      details: { printerIp, filePath, filename: fileName },
    });
    res.json({ message: 'File imported to storage', filename: fileName });
  } catch (err) {
    res.status(500).json({ error: `Failed to import: ${err.message}` });
  }
});

// POST /api/storage/upload - Upload file
router.post('/upload', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  ActivityLog.create({
    userId: req.user.id || req.user._id,
    username: req.user.username,
    action: 'storage_upload',
    details: { filename: req.file.filename, size: req.file.size, path: req.body.path || '' },
  });
  res.json({
    filename: req.file.filename,
    size: req.file.size,
    message: 'File uploaded successfully',
  });
});

// POST /api/storage/folder - Create folder
router.post('/folder', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage not configured' });
  }

  const { folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Folder path required' });

  const fullPath = path.join(storagePath, folderPath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    fs.mkdirSync(fullPath, { recursive: true });
    res.json({ message: 'Folder created' });
  } catch {
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// GET /api/storage/download/:filepath - Download/serve file
router.get('/download/*', authenticate, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage not configured' });
  }

  const filePath = req.params[0];
  const fullPath = path.join(storagePath, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(resolved);
});

// DELETE /api/storage/files/:filepath - Delete file or folder
router.delete('/files/*', authenticate, requireAdmin, (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage not configured' });
  }

  const filePath = req.params[0];
  const fullPath = path.join(storagePath, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
    ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: 'storage_delete',
      details: { filePath: req.params[0] },
    });
    res.json({ message: 'Deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// POST /api/storage/send-to-printer - Send file from storage to printer via Moonraker
router.post('/send-to-printer', authenticate, async (req, res) => {
  const storagePath = ensureStoragePath();
  if (!storagePath) {
    return res.status(400).json({ error: 'Storage not configured' });
  }

  const { filePath, printerIp, startPrint } = req.body;
  if (!filePath || !printerIp) {
    return res.status(400).json({ error: 'filePath and printerIp required' });
  }

  const fullPath = path.join(storagePath, filePath);
  const resolved = path.resolve(fullPath);
  if (!resolved.startsWith(path.resolve(storagePath))) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  try {
    // Upload to Moonraker
    const FormData = require('form-data');
    const form = new FormData();
    form.append('file', fs.createReadStream(fullPath));
    if (startPrint) form.append('print', 'true');

    const http = require('http');
    await new Promise((resolve, reject) => {
      const uploadReq = http.request(
        {
          hostname: printerIp,
          port: 80,
          path: '/server/files/upload',
          method: 'POST',
          headers: form.getHeaders(),
          timeout: 30000,
        },
        (uploadRes) => {
          let data = '';
          uploadRes.on('data', (chunk) => (data += chunk));
          uploadRes.on('end', () => {
            if (uploadRes.statusCode >= 200 && uploadRes.statusCode < 300) {
              resolve(data);
            } else {
              reject(new Error(`Upload failed: ${uploadRes.statusCode}`));
            }
          });
        }
      );
      uploadReq.on('error', reject);
      uploadReq.on('timeout', () => { uploadReq.destroy(); reject(new Error('Timeout')); });
      form.pipe(uploadReq);
    });

    ActivityLog.create({
      userId: req.user.id || req.user._id,
      username: req.user.username,
      action: startPrint ? 'printer_start' : 'printer_upload',
      details: { filePath, printerIp, startPrint },
    });
    res.json({ message: startPrint ? 'File sent and printing started' : 'File sent to printer' });
  } catch (err) {
    res.status(500).json({ error: `Failed to send file: ${err.message}` });
  }
});

module.exports = router;
