const { getDB } = require('../db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

function logAction(db, adminId, action, targetType, targetId, detail) {
  db.prepare('INSERT INTO operation_logs (admin_id, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?)')
    .run(adminId, action, targetType, targetId || 0, detail || '');
}

function register(router) {
  router.use('/api/admin', authMiddleware, adminMiddleware);

  // ═══════════════════════════════════════
  // DASHBOARD STATS
  // ═══════════════════════════════════════
  router.get('/api/admin/stats', (_req, res) => {
    const db = getDB();
    const photos   = db.prepare("SELECT COUNT(*) AS c FROM photos").get().c;
    const videos   = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE media_type = 'video'").get().c;
    const pending  = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE status = 'pending'").get().c;
    const users    = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const banned   = db.prepare('SELECT COUNT(*) AS c FROM users WHERE banned = 1').get().c;
    const downloads = db.prepare('SELECT COALESCE(SUM(download_count), 0) AS c FROM photos').get().c;
    const albums   = db.prepare('SELECT COUNT(*) AS c FROM albums').get().c;
    const featured = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE featured = 1').get().c;
    const todayUp  = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE created_at >= datetime('now', '-1 day')").get().c;
    const todayDl  = db.prepare("SELECT COUNT(*) AS c FROM downloads WHERE created_at >= datetime('now', '-1 day')").get().c;
    const todayReg = db.prepare("SELECT COUNT(*) AS c FROM users WHERE created_at >= datetime('now', '-1 day')").get().c;

    res.json({ photos, videos, pending, users, banned, downloads, albums, featured, today_uploads: todayUp, today_downloads: todayDl, today_registrations: todayReg });
  });

  // ═══════════════════════════════════════
  // PHOTOS — review, delete, feature, batch
  // ═══════════════════════════════════════
  router.get('/api/admin/photos', (req, res) => {
    const db = getDB();
    const { status, search, page = 1, per_page = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);
    let where = 'WHERE 1=1'; const params = [];
    if (status === 'pending')  { where += " AND p.status = 'pending'"; }
    else if (status === 'approved') { where += " AND p.status = 'approved'"; }
    else if (status === 'rejected') { where += " AND p.status = 'rejected'"; }
    if (search) { where += ' AND (p.title LIKE ? OR p.original_name LIKE ?)'; params.push('%'+search+'%', '%'+search+'%'); }

    const total = db.prepare(`SELECT COUNT(*) AS c FROM photos p ${where}`).get(...params).c;
    const rows = db.prepare(`
      SELECT p.*, a.name AS album_name, u.username AS uploader_name
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id LEFT JOIN users u ON u.id = p.uploader_id
      ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(per_page), offset);
    res.json({ photos: rows, total, page: parseInt(page), total_pages: Math.ceil(total / parseInt(per_page)) });
  });

  router.patch('/api/admin/photos/:id/review', (req, res) => {
    const db = getDB();
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态值无效' });
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });
    db.prepare('UPDATE photos SET status = ? WHERE id = ?').run(status, req.params.id);
    logAction(db, req.user.id, status === 'approved' ? 'approve_photo' : 'reject_photo', 'photo', req.params.id, photo.title || photo.original_name);
    res.json({ success: true, status });
  });

  router.patch('/api/admin/photos/:id/feature', (req, res) => {
    const db = getDB();
    const { featured } = req.body;
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });
    db.prepare('UPDATE photos SET featured = ? WHERE id = ?').run(featured ? 1 : 0, req.params.id);
    logAction(db, req.user.id, featured ? 'feature_photo' : 'unfeature_photo', 'photo', req.params.id, photo.title || photo.original_name);
    res.json({ success: true, featured: !!featured });
  });

  router.patch('/api/admin/photos/:id/tags', (req, res) => {
    const db = getDB();
    const { tags } = req.body;
    if (tags === undefined) return res.status(400).json({ error: '请提供标签' });
    db.prepare('UPDATE photos SET tags = ? WHERE id = ?').run(tags, req.params.id);
    logAction(db, req.user.id, 'update_tags', 'photo', req.params.id, tags);
    res.json({ success: true });
  });

  router.delete('/api/admin/photos/:id', (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });
    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch {}
    logAction(db, req.user.id, 'delete_photo', 'photo', req.params.id, photo.title || photo.original_name);
    res.json({ success: true });
  });

  // Batch review
  router.post('/api/admin/photos/batch-review', (req, res) => {
    const db = getDB();
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: '请选择图片' });
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: '状态无效' });
    const stmt = db.prepare('UPDATE photos SET status = ? WHERE id = ?');
    db.transaction(() => { for (const id of ids) stmt.run(status, id); })();
    logAction(db, req.user.id, 'batch_review', 'photo', 0, `${ids.length} photos → ${status}`);
    res.json({ success: true, count: ids.length });
  });

  // ═══════════════════════════════════════
  // BANNERS
  // ═══════════════════════════════════════
  router.get('/api/admin/banners', (_req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT * FROM banners ORDER BY sort_order, id DESC').all());
  });

  router.post('/api/admin/banners', (req, res) => {
    const db = getDB();
    const { title, image_url, link_url, sort_order } = req.body;
    if (!image_url) return res.status(400).json({ error: '请提供图片URL' });
    const info = db.prepare('INSERT INTO banners (title, image_url, link_url, sort_order) VALUES (?, ?, ?, ?)')
      .run(title || '', image_url, link_url || '', sort_order || 0);
    logAction(db, req.user.id, 'create_banner', 'banner', info.lastInsertRowid, title);
    res.status(201).json({ id: info.lastInsertRowid });
  });

  router.patch('/api/admin/banners/:id', (req, res) => {
    const db = getDB();
    const { title, image_url, link_url, sort_order, is_active } = req.body;
    const allowedFields = { title: 'title', image_url: 'image_url', link_url: 'link_url', sort_order: 'sort_order', is_active: 'is_active' };
    const fields = []; const params = [];
    for (const [key, col] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(key === 'is_active' ? (req.body[key] ? 1 : 0) : req.body[key]);
      }
    }
    if (fields.length) { params.push(req.params.id); db.prepare(`UPDATE banners SET ${fields.join(', ')} WHERE id = ?`).run(...params); }
    logAction(db, req.user.id, 'update_banner', 'banner', req.params.id);
    res.json({ success: true });
  });

  router.delete('/api/admin/banners/:id', (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
    logAction(db, req.user.id, 'delete_banner', 'banner', req.params.id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════
  // ALBUMS
  // ═══════════════════════════════════════
  router.get('/api/admin/albums', (_req, res) => {
    const db = getDB();
    res.json(db.prepare('SELECT a.*, COUNT(p.id) AS photo_count FROM albums a LEFT JOIN photos p ON p.album_id = a.id GROUP BY a.id ORDER BY a.id').all());
  });

  router.post('/api/admin/albums', (req, res) => {
    const db = getDB();
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: '分类名不能为空' });
    let slug = req.body.slug || name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
    if (!slug) slug = 'album-' + Date.now();
    try {
      const info = db.prepare('INSERT INTO albums (name, slug, description) VALUES (?, ?, ?)').run(name, slug, description || '');
      logAction(db, req.user.id, 'create_album', 'album', info.lastInsertRowid, name);
      res.status(201).json({ id: info.lastInsertRowid, name, slug });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '标识已存在' });
      throw err;
    }
  });

  router.patch('/api/admin/albums/:id', (req, res) => {
    const db = getDB();
    const { name, description } = req.body;
    const fields = []; const params = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (description !== undefined) { fields.push('description = ?'); params.push(description); }
    if (!fields.length) return res.status(400).json({ error: '无更新内容' });
    params.push(req.params.id);
    db.prepare(`UPDATE albums SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    logAction(db, req.user.id, 'update_album', 'album', req.params.id, name);
    res.json({ success: true });
  });

  router.delete('/api/admin/albums/:id', (req, res) => {
    const db = getDB();
    db.prepare('UPDATE photos SET album_id = NULL WHERE album_id = ?').run(req.params.id);
    db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
    logAction(db, req.user.id, 'delete_album', 'album', req.params.id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════
  // USERS — ban, role, delete
  // ═══════════════════════════════════════
  router.get('/api/admin/users', (req, res) => {
    const db = getDB();
    const { page = 1, per_page = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);
    let where = 'WHERE 1=1'; const params = [];
    if (search) { where += ' AND (u.username LIKE ? OR u.email LIKE ?)'; params.push('%'+search+'%', '%'+search+'%'); }
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...params).c;
    const users = db.prepare(`
      SELECT u.*, (SELECT COUNT(*) FROM photos WHERE uploader_id = u.id) AS photo_count
      FROM users u ${where} ORDER BY u.created_at DESC LIMIT ? OFFSET ?
    `).all(...params, parseInt(per_page), offset);
    res.json({ users, total, page: parseInt(page), total_pages: Math.ceil(total / parseInt(per_page)) });
  });

  router.patch('/api/admin/users/:id/role', (req, res) => {
    const db = getDB();
    const { role } = req.body;
    if (!['user', 'admin'].includes(role)) return res.status(400).json({ error: '角色无效' });
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
    logAction(db, req.user.id, 'change_role', 'user', req.params.id, role);
    res.json({ success: true });
  });

  router.patch('/api/admin/users/:id/ban', (req, res) => {
    const db = getDB();
    const { banned, reason } = req.body;
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能封禁自己' });
    db.prepare('UPDATE users SET banned = ?, banned_reason = ? WHERE id = ?').run(banned ? 1 : 0, reason || '', req.params.id);
    logAction(db, req.user.id, banned ? 'ban_user' : 'unban_user', 'user', req.params.id, reason);
    res.json({ success: true });
  });

  router.delete('/api/admin/users/:id', (req, res) => {
    const db = getDB();
    if (parseInt(req.params.id) === req.user.id) return res.status(400).json({ error: '不能删除自己' });
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    logAction(db, req.user.id, 'delete_user', 'user', req.params.id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════
  // OPERATION LOGS
  // ═══════════════════════════════════════
  router.get('/api/admin/logs', (req, res) => {
    const db = getDB();
    const { page = 1, per_page = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(per_page);
    const total = db.prepare('SELECT COUNT(*) AS c FROM operation_logs').get().c;
    const rows = db.prepare(`
      SELECT l.*, u.username AS admin_name
      FROM operation_logs l LEFT JOIN users u ON u.id = l.admin_id
      ORDER BY l.created_at DESC LIMIT ? OFFSET ?
    `).all(parseInt(per_page), offset);
    res.json({ logs: rows, total, page: parseInt(page), total_pages: Math.ceil(total / parseInt(per_page)) });
  });
}

module.exports = { register };
