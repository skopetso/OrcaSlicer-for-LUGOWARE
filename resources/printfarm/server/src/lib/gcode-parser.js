const fs = require('fs');

/**
 * Parse gcode file for metadata (filament info + thumbnail)
 * Reads first 200KB for thumbnail, last 50KB for filament metadata
 */
function parseGcodeMetadata(filePath) {
  const meta = {
    filaments: [],
    thumbnail: null,
    estimatedTime: null,
  };

  try {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;

    // ─── Read first 200KB for thumbnail ───
    const headerSize = Math.min(200 * 1024, fileSize);
    const headerBuf = Buffer.alloc(headerSize);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, headerBuf, 0, headerSize, 0);

    // ─── Read last 50KB for metadata ───
    const tailSize = Math.min(50 * 1024, fileSize);
    const tailBuf = Buffer.alloc(tailSize);
    fs.readSync(fd, tailBuf, 0, tailSize, Math.max(0, fileSize - tailSize));
    fs.closeSync(fd);

    // ─── Parse thumbnail from header ───
    const headerStr = headerBuf.toString('utf8');
    let thumbnailData = '';
    let inThumbnail = false;

    for (const line of headerStr.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('; thumbnail begin')) {
        inThumbnail = true;
        thumbnailData = '';
        continue;
      }
      if (trimmed === '; thumbnail end') {
        if (thumbnailData) {
          meta.thumbnail = `data:image/png;base64,${thumbnailData}`;
        }
        inThumbnail = false;
        continue;
      }
      if (inThumbnail) {
        thumbnailData += trimmed.replace(/^;\s*/, '');
        continue;
      }
    }

    // ─── Parse metadata from tail ───
    const tailStr = tailBuf.toString('utf8');
    let filamentType = [];
    let filamentColor = [];
    let filamentWeight = [];

    for (const line of tailStr.split('\n')) {
      const trimmed = line.trim();

      // filament_type = PLA;TPU;PETG;PETG
      if (trimmed.startsWith('; filament_type')) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) {
          // Remove anything after the next ; that looks like a key
          const cleanVal = val.split('\n')[0].trim();
          filamentType = cleanVal.includes(';')
            ? cleanVal.split(';').map(s => s.trim())
            : cleanVal.split(',').map(s => s.trim());
        }
      }

      // filament_colour = #FF8000;#C0C0C0;#FF0000;#00C1AE
      if ((trimmed.startsWith('; filament_colour =') || trimmed.startsWith('; filament_color =')) && !trimmed.includes('_type')) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) {
          filamentColor = val.includes(';')
            ? val.split(';').map(s => s.trim())
            : val.split(',').map(s => s.trim());
        }
      }

      // filament used [g] = 7.20, 7.93, 0.00, 0.00
      if (trimmed.startsWith('; filament used [g]') || trimmed.startsWith('; filament_weight')) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) {
          filamentWeight = val.includes(';')
            ? val.split(';').map(s => parseFloat(s.trim()) || 0)
            : val.split(',').map(s => parseFloat(s.trim()) || 0);
        }
      }

      // estimated printing time
      if (trimmed.startsWith('; estimated printing time') || trimmed.startsWith('; total estimated time')) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) meta.estimatedTime = val;
      }

      // default_filament_colour (fallback)
      if (trimmed.startsWith('; default_filament_colour') && filamentColor.length === 0) {
        const val = trimmed.split('=')[1]?.trim();
        if (val) {
          filamentColor = val.includes(';')
            ? val.split(';').map(s => s.trim())
            : val.split(',').map(s => s.trim());
        }
      }
    }

    // Build filaments array (4 tools)
    const toolCount = Math.max(4, filamentType.length, filamentColor.length, filamentWeight.length);
    for (let i = 0; i < Math.min(toolCount, 4); i++) {
      meta.filaments.push({
        name: filamentType[i] || '',
        color: filamentColor[i] || '',
        weight: filamentWeight[i] || 0,
      });
    }

    // Fill remaining slots up to 4
    while (meta.filaments.length < 4) {
      meta.filaments.push({ name: '', color: '', weight: 0 });
    }

  } catch {
    // Return empty metadata on error
  }

  return meta;
}

module.exports = { parseGcodeMetadata };
