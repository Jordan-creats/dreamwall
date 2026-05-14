const { getDB } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function register(router) {
  // All admin routes require auth + admin role
  router.use('/api/admin', authMiddleware, adminMiddleware);

  // GET /api/admin/stats
  router.get('/api/admin/stats', (_req, res) => {
    const db = getDB();
    const photos = db.prepare("SELECT COUNT(*) AS c FROM photos").get().c;
    const videos = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE media_type = 'video'").get().c;
    const pending = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE status = 'pending'").get().c;
    const users = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const downloads = db.prepare('SELECT COALESCE(SUM(download_count), 0) AS c FROM photos').get().c;
    const albums = db.prepare('SELECT COUNT(*) AS c FROM albums').get().c;
    res.json({ photos, videos, pending, users, downloads, albums });
  });

  // GET /api/admin/photos?status=pending&page=1&per_page=20
  router.get('/api/admin/photos', (req, res) => {
    const db = getDB();
    const { status, page = 1, per_page = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);

    let where = ''; const params = [];
    if (status === 'pending') { where = "WHERE p.status = 'pending'"; }
    else if (status === 'approved') { where = "WHERE p.status = 'approved'"; }
    else if (status === 'rejected') { where = "WHERE p.status = 'rejected'"; }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM photos p ${where}`).get(...params).c;
    const rows = db.prepare(`
      SELECT p.*, a.name AS album_name, u.username AS uploader_name
      FROM photos p
      LEFT JOIN albums a ON a.id = p.album_id
      LEFT JOIN users u ON u.id = p.uploader_id
      ${where}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(per_page), offset);

    res.json({ photos: rows, total, page: parseInt(page), per_page: parseInt(per_page), total_pages: Math.ceil(total / parseInt(per_page)) });
  });

  // PATCH /api/admin/photos/:id/review
  router.patch('/api/admin/photos/:id/review', (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态值无效' });

    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    db.prepare('UPDATE photos SET status = ? WHERE id = ?').run(status, req.params.id);

    // If rejected, optionally delete file
    if (status === 'rejected') {
      const fp = path.join(UPLOADS_DIR, photo.filename);
      try { fs.unlinkSync(fp); } catch {}
    }

    res.json({ success: true, status });
  });

  // DELETE /api/admin/photos/:id
  router.delete('/api/admin/photos/:id', (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch {}
    if (photo.thumbnail) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, 'thumbs', photo.thumbnail)); } catch {}
    }
    res.json({ success: true });
  });

  // POST /api/admin/albums
  router.post('/api/admin/albums', (req, res) => {
    const db = getDB();
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '分类名不能为空' });

    let slug = req.body.slug || name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = 'album-' + Date.now();

    try {
      const info = db.prepare('INSERT INTO albums (name, slug, description) VALUES (?, ?, ?)').run(name, slug, description || '');
      res.status(201).json({ id: info.lastInsertRowid, name, slug });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '标识已存在' });
      throw err;
    }
  });

  // PATCH /api/admin/albums/:id
  router.patch('/api/admin/albums/:id', (req, res) => {
    const db = getDB();
    const { name, description } = req.body;
    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (!fields.length) return res.status(400).json({ error: '无更新内容' });
    params.push(req.params.id);
    db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  });

  // DELETE /api/admin/albums/:id
  router.delete('/api/admin/albums/:id', (req, res) => {
    const db = getDB();
    const album = db.prepare('SELECT * FROM albums WHERE id = ?').get(req.params.id);
    if (!album) return res.status(404).json({ error: '分类不存在' });
    db.prepare('UPDATE photos SET album_id = NULL WHERE album_id = ?').run(req.params.id);
    db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // GET /api/admin/users?page=1
  router.get('/api/admin/users', (req, res) => {
    const db = getDB();
    const { page = 1, per_page = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);
    const total = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const users = db.prepare(`
      SELECT u.id, u.username, u.email, u.avatar, u.role, u.created_at,
        (SELECT COUNT(*) FROM photos WHERE uploader_id = u.id) AS photo_count
      FROM users u ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).all(parseInt(per_page), offset);
    res.json({ users, total, page: parseInt(page), total_pages: Math.ceil(total / parseInt(per_page)) });
  });

  // PATCH /api/admin/users/:id/role
  router.patch('/api/admin/users/:id/role', (req, res) => {
    const db = getDB();
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: '角色无效' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    res.json({ success: true });
  });

  // DELETE /api/admin/users/:id
  router.delete('/api/admin/users/:id', (req, res) => {
    const db = getDB();
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });
}

module.exports = { register };
