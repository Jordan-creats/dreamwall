const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db');
const { authMiddleware, generateToken, setTokenCookie, clearTokenCookie } = require('../middleware/auth');

function register(router) {
  // ═══════════════════════════════════════
  // POST /api/auth/register
  // ═══════════════════════════════════════
  router.post('/api/auth/register', [
    body('username').trim().isLength({ min: 2, max: 30 }).withMessage('用户名2-30个字符'),
    body('email').isEmail().normalizeEmail().withMessage('邮箱格式不正确'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, email, password } = req.body;
    const db = getDB();

    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) return res.status(409).json({ error: '用户名或邮箱已存在' });

    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)').run(username, email, hash);

    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = generateToken(user);
    setTokenCookie(res, token);

    res.status(201).json({ user, token }); // token 也返回到 body 供前端读取 user 信息
  });

  // ═══════════════════════════════════════
  // POST /api/auth/login
  // ═══════════════════════════════════════
  router.post('/api/auth/login', [
    body('login').trim().notEmpty().withMessage('请输入用户名或邮箱'),
    body('password').notEmpty().withMessage('请输入密码'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { login, password } = req.body;
    const db = getDB();

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(login, login);
    if (!user) return res.status(401).json({ error: '用户名或密码错误' });

    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    setTokenCookie(res, token);

    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  // ═══════════════════════════════════════
  // POST /api/auth/logout
  // ═══════════════════════════════════════
  router.post('/api/auth/logout', (_req, res) => {
    clearTokenCookie(res);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════
  // GET /api/auth/me — 当前用户完整信息
  // ═══════════════════════════════════════
  router.get('/api/auth/me', authMiddleware, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
    const dlCount   = db.prepare('SELECT COUNT(*) AS c FROM downloads WHERE user_id = ?').get(user.id).c;
    const upCount   = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ? AND status = 'approved'").get(user.id).c;

    res.json({ ...user, fav_count: favCount, dl_count: dlCount, upload_count: upCount });
  });

  // ═══════════════════════════════════════
  // PATCH /api/auth/profile — 更新个人资料
  // ═══════════════════════════════════════
  router.patch('/api/auth/profile', authMiddleware, [
    body('avatar').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
  ], (req, res) => {
    const db = getDB();
    const { avatar, email } = req.body;
    const allowedFields = { avatar: 'avatar', email: 'email' };
    const fields = []; const params = [];
    for (const [key, col] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(req.body[key]);
      }
    }
    if (fields.length) {
      params.push(req.user.id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }
    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  });

  // ═══════════════════════════════════════
  // GET /api/auth/uploads — 我的上传记录（分页）
  // ═══════════════════════════════════════
  router.get('/api/auth/uploads', authMiddleware, (req, res) => {
    const db = getDB();
    const { page = 1, per_page = 24 } = req.query;
    const limit = Math.min(parseInt(per_page) || 24, 50);
    const offset = (Math.max(parseInt(page), 1) - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ?').get(req.user.id).c;
    const rows = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug
      FROM photos p
      LEFT JOIN albums a ON a.id = p.album_id
      WHERE p.uploader_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, limit, offset);

    res.json({
      photos: rows,
      total,
      page: Math.max(parseInt(page), 1),
      per_page: limit,
      total_pages: Math.ceil(total / limit),
    });
  });

  // ═══════════════════════════════════════
  // GET /api/auth/stats — 我的统计数据
  // ═══════════════════════════════════════
  router.get('/api/auth/stats', authMiddleware, (req, res) => {
    const db = getDB();
    const userId = req.user.id;
    const uploads  = db.prepare('SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ?').get(userId).c;
    const approved = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ? AND status = 'approved'").get(userId).c;
    const pending  = db.prepare("SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ? AND status = 'pending'").get(userId).c;
    const favorites = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(userId).c;
    const downloads = db.prepare('SELECT COUNT(*) AS c FROM downloads WHERE user_id = ?').get(userId).c;
    const totalDl   = db.prepare('SELECT COALESCE(SUM(download_count), 0) AS c FROM photos WHERE uploader_id = ?').get(userId).c;

    res.json({ uploads, approved, pending, favorites, downloads, total_downloads: totalDl });
  });

  // ═══════════════════════════════════════
  // GET /api/user/:username — 公开用户主页
  // ═══════════════════════════════════════
  router.get('/api/user/:username', (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT id, username, avatar, role, created_at FROM users WHERE username = ?').get(req.params.username);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const stats = {
      uploads:  db.prepare("SELECT COUNT(*) AS c FROM photos WHERE uploader_id = ? AND status = 'approved'").get(user.id).c,
      favorites: db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c,
      downloads: db.prepare('SELECT COALESCE(SUM(download_count), 0) AS c FROM photos WHERE uploader_id = ?').get(user.id).c,
    };

    const photos = db.prepare(`
      SELECT p.*, a.name AS album_name
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id
      WHERE p.uploader_id = ? AND p.status = 'approved'
      ORDER BY p.created_at DESC LIMIT 50
    `).all(user.id);

    res.json({ user: { ...user, ...stats }, photos });
  });

  // ═══════════════════════════════════════
  // Favorites CRUD
  // ═══════════════════════════════════════
  router.get('/api/auth/favorites', authMiddleware, (req, res) => {
    const db = getDB();
    const rows = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug, f.created_at AS fav_at
      FROM favorites f
      JOIN photos p ON p.id = f.photo_id
      LEFT JOIN albums a ON a.id = p.album_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
      LIMIT 200
    `).all(req.user.id);
    res.json({ photos: rows });
  });

  router.post('/api/auth/favorites/:photoId', authMiddleware, (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.photoId);
    if (!photo) return res.status(404).json({ error: '资源不存在' });
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, photo_id) VALUES (?, ?)').run(req.user.id, req.params.photoId);
    res.json({ favorited: true });
  });

  router.delete('/api/auth/favorites/:photoId', authMiddleware, (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND photo_id = ?').run(req.user.id, req.params.photoId);
    res.json({ favorited: false });
  });
}

module.exports = { register };
