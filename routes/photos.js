const { getDB } = require('../db');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const { optionalAuth } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const THUMBS_DIR = path.join(__dirname, '..', 'uploads', 'thumbs');

function ensureDirs() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

function isVideo(mimetype) { return mimetype && mimetype.startsWith('video/'); }

function register(router, upload) {
  // GET /api/photos — list with filters + pagination
  router.get('/api/photos', optionalAuth, (req, res) => {
    const db = getDB();
    const { album, search, sort, time, type, page = 1, per_page = 24 } = req.query;
    const limit = Math.min(parseInt(per_page) || 24, 100);
    const offset = (Math.max(parseInt(page), 1) - 1) * limit;

    const conditions = ["p.status = 'approved'"];
    const params = [];

    if (album && album !== 'all') { conditions.push('a.slug = ?'); params.push(album); }
    if (search && search.trim()) {
      conditions.push("(p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)");
      const q = `%${search.trim()}%`; params.push(q, q, q);
    }
    if (time === 'today') conditions.push("p.created_at >= datetime('now', '-1 day')");
    else if (time === 'week') conditions.push("p.created_at >= datetime('now', '-7 days')");
    else if (time === 'month') conditions.push("p.created_at >= datetime('now', '-30 days')");
    if (type === 'image') conditions.push("p.media_type = 'image'");
    else if (type === 'video') conditions.push("p.media_type = 'video'");

    let orderBy = 'p.created_at DESC';
    if (sort === 'popular') orderBy = 'p.download_count DESC';
    else if (sort === 'resolution') orderBy = '(p.width * p.height) DESC';

    const where = 'WHERE ' + conditions.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS c FROM photos p LEFT JOIN albums a ON a.id = p.album_id ${where}`).get(...params).c;
    const rows = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id
      ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // If user is logged in, mark favorites
    if (req.user) {
      const favIds = new Set(
        db.prepare(`SELECT photo_id FROM favorites WHERE user_id = ? AND photo_id IN (${rows.map(() => '?').join(',') || '0'})`)
          .all(req.user.id, ...rows.map(r => r.id)).map(r => r.photo_id)
      );
      rows.forEach(r => r.is_faved = favIds.has(r.id));
    }

    res.json({ photos: rows, total, page: Math.max(parseInt(page), 1), per_page: limit, total_pages: Math.ceil(total / limit) });
  });

  // GET /api/photos/:id
  router.get('/api/photos/:id', optionalAuth, (req, res) => {
    const db = getDB();
    const row = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id WHERE p.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: '资源不存在' });
    if (req.user) {
      row.is_faved = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND photo_id = ?').get(req.user.id, row.id);
    }
    res.json(row);
  });

  // POST /api/photos/upload
  router.post('/api/photos/upload', (req, res, next) => {
    ensureDirs();
    upload.single('photo')(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '文件过大小超过100MB限制' });
        return res.status(400).json({ error: err.message });
      }
      if (!req.file) return res.status(400).json({ error: '请选择文件' });

      try {
        const video = isVideo(req.file.mimetype);
        let width = 0, height = 0;
        if (!video) {
          try { const dims = sizeOf(req.file.path); width = dims.width || 0; height = dims.height || 0; } catch {}
        }

        const albumId = req.body.album_id ? parseInt(req.body.album_id) || null : null;
        const uploaderId = req.body.uploader_id ? parseInt(req.body.uploader_id) || null : null;

        const db = getDB();
        const info = db.prepare(`
          INSERT INTO photos (album_id, uploader_id, filename, original_name, media_type, width, height, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(albumId, uploaderId, req.file.filename, req.file.originalname, video ? 'video' : 'image', width, height, req.file.size);

        const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid);
        res.status(201).json(row);
      } catch (e) {
        try { fs.unlinkSync(req.file.path); } catch {}
        throw e;
      }
    });
  });

  // PATCH /api/photos/:id
  router.patch('/api/photos/:id', (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    const { title, description, tags, album_id, thumbnail } = req.body;
    const fields = []; const params = [];
    if (title !== undefined) { fields.push('title = ?'); params.push(title); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (tags !== undefined) { fields.push('tags = ?'); params.push(tags); }
    if (thumbnail !== undefined) { fields.push('thumbnail = ?'); params.push(thumbnail); }
    if (album_id !== undefined) { fields.push('album_id = ?'); params.push(album_id === null ? null : parseInt(album_id) || null); }

    if (fields.length) {
      params.push(req.params.id);
      db.prepare(`UPDATE photos SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    const updated = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id WHERE p.id = ?
    `).get(req.params.id);
    res.json(updated);
  });

  // DELETE /api/photos/:id
  router.delete('/api/photos/:id', (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch {}
    if (photo.thumbnail) { try { fs.unlinkSync(path.join(THUMBS_DIR, photo.thumbnail)); } catch {} }
    res.json({ success: true });
  });

  // POST /api/photos/:id/download
  router.post('/api/photos/:id/download', optionalAuth, (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    db.prepare('UPDATE photos SET download_count = download_count + 1 WHERE id = ?').run(req.params.id);
    if (req.user) {
      db.prepare('INSERT INTO downloads (user_id, photo_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    }
    const updated = db.prepare('SELECT download_count FROM photos WHERE id = ?').get(req.params.id);
    res.json({ download_count: updated.download_count });
  });
}

module.exports = { register };
