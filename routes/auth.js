const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db');
const { authMiddleware, generateToken } = require('../middleware/auth');

function register(router) {
  // POST /api/auth/register
  router.post('/api/auth/register', [
    body('username').trim().isLength({ min: 2, max: 30 }).withMessage('用户名2-30个字符'),
    body('email').isEmail().normalizeEmail().withMessage('邮箱格式不正确'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  ], async (req, res) => {
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
    res.status(201).json({ user, token });
  });

  // POST /api/auth/login
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
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  // GET /api/auth/me
  router.get('/api/auth/me', authMiddleware, (req, res) => {
    const db = getDB();
    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });

    const favCount = db.prepare('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?').get(user.id).c;
    const dlCount = db.prepare('SELECT COUNT(*) AS c FROM downloads WHERE user_id = ?').get(user.id).c;
    res.json({ ...user, fav_count: favCount, dl_count: dlCount });
  });

  // PATCH /api/auth/profile
  router.patch('/api/auth/profile', authMiddleware, [
    body('avatar').optional().trim(),
    body('email').optional().isEmail().normalizeEmail(),
  ], (req, res) => {
    const db = getDB();
    const { avatar, email } = req.body;
    const fields = []; const params = [];
    if (avatar !== undefined) { fields.push('avatar = ?'); params.push(avatar); }
    if (email !== undefined) { fields.push('email = ?'); params.push(email); }
    if (fields.length) {
      params.push(req.user.id);
      db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }
    const user = db.prepare('SELECT id, username, email, avatar, role, created_at FROM users WHERE id = ?').get(req.user.id);
    res.json(user);
  });

  // GET /api/auth/favorites
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

  // POST /api/auth/favorites/:photoId
  router.post('/api/auth/favorites/:photoId', authMiddleware, (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT id FROM photos WHERE id = ?').get(req.params.photoId);
    if (!photo) return res.status(404).json({ error: '资源不存在' });
    try {
      db.prepare('INSERT OR IGNORE INTO favorites (user_id, photo_id) VALUES (?, ?)').run(req.user.id, req.params.photoId);
      res.json({ favorited: true });
    } catch { res.json({ favorited: true }); }
  });

  // DELETE /api/auth/favorites/:photoId
  router.delete('/api/auth/favorites/:photoId', authMiddleware, (req, res) => {
    const db = getDB();
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND photo_id = ?').run(req.user.id, req.params.photoId);
    res.json({ favorited: false });
  });
}

module.exports = { register };
