const express = require('express');
const http = require('http');
const router = express.Router();

// Webcam snapshot proxy: GET /api/webcam/:ip/snapshot
router.get('/:ip/snapshot', (req, res) => {
  const printerIp = req.params.ip;
  const url = `http://${printerIp}/webcam/?action=snapshot`;

  const proxyReq = http.get(url, { timeout: 5000 }, (proxyRes) => {
    res.set('Content-Type', proxyRes.headers['content-type'] || 'image/jpeg');
    res.set('Cache-Control', 'no-cache');
    proxyRes.pipe(res);
  });

  proxyReq.on('error', () => {
    res.status(502).json({ error: 'Webcam not reachable' });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    res.status(504).json({ error: 'Webcam timeout' });
  });
});

// Webcam stream proxy: GET /api/webcam/:ip/stream
router.get('/:ip/stream', (req, res) => {
  const printerIp = req.params.ip;
  const url = `http://${printerIp}/webcam/?action=stream`;

  const proxyReq = http.get(url, { timeout: 10000 }, (proxyRes) => {
    res.set('Content-Type', proxyRes.headers['content-type'] || 'multipart/x-mixed-replace;boundary=BoundaryString');
    res.set('Cache-Control', 'no-cache');
    res.set('Connection', 'keep-alive');
    proxyRes.pipe(res);

    // Clean up when client disconnects
    res.on('close', () => {
      proxyRes.destroy();
    });
  });

  proxyReq.on('error', () => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Webcam not reachable' });
    }
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Webcam timeout' });
    }
  });
});

module.exports = router;
