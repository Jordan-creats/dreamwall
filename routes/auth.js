const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db');
const { authMiddleware, generateToken, setTokenCookie, clearTokenCookie } = require('../middleware/auth');
const { sendResetCode } = require('../services/mail');

const isDev = process.env.NODE_ENV !== 'production';
const HAS_SMS = !!(process.env.SMS_API_KEY && process.env.SMS_API_SECRET);
const HAS_WECHAT = !!(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
const HAS_MAIL = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

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

    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ? OR phone = ?').get(login, login, login);
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

  // ═══════════════════════════════════════
  // POST /api/auth/forgot-password
  // ═══════════════════════════════════════
  router.post('/api/auth/forgot-password', [
    body('email').isEmail().normalizeEmail().withMessage('请输入有效的邮箱地址'),
  ], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { email } = req.body;
    const db = getDB();
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

    // ★ 无论用户是否存在，都返回成功（防止邮箱枚举）
    if (!user) {
      return res.json({ success: true, message: '如果该邮箱已注册，重置码已发送' });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = bcrypt.hashSync(rawToken, 10);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO password_resets (user_id, token_hash, code, expires_at) VALUES (?, ?, ?, ?)')
      .run(user.id, tokenHash, code, expiresAt);

    // 发送邮件
    if (HAS_MAIL) {
      try {
        await sendResetCode(email, code);
        console.log(`[mail] 重置码已发送到 ${email}`);
      } catch (err) {
        console.error('[mail] 发送失败:', err.message);
      }
    }

    const resp = { success: true, message: '如果该邮箱已注册，重置码已发送' };
    if (!HAS_MAIL) {
      resp.dev_note = '邮件服务未配置，开发模式显示验证码';
      resp.dev_token = rawToken;
      resp.dev_code = code;
    }
    res.json(resp);
  });

  // ═══════════════════════════════════════
  // POST /api/auth/reset-password
  // ═══════════════════════════════════════
  router.post('/api/auth/reset-password', [
    body('token').notEmpty().withMessage('缺少重置令牌'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('验证码为6位数字'),
    body('new_password').isLength({ min: 6 }).withMessage('新密码至少6位'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { token, code, new_password } = req.body;
    const db = getDB();

    const reset = db.prepare("SELECT * FROM password_resets WHERE used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 10").all();

    let matched = null;
    for (const r of reset) {
      if (bcrypt.compareSync(token, r.token_hash) && r.code === code) {
        matched = r;
        break;
      }
    }

    if (!matched) {
      return res.status(400).json({ error: '重置链接无效或已过期' });
    }

    const passwordHash = bcrypt.hashSync(new_password, 10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, matched.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE user_id = ?').run(matched.user_id);

    res.json({ success: true, message: '密码已重置，请重新登录' });
  });

  // ═══════════════════════════════════════
  // POST /api/auth/send-sms
  // ═══════════════════════════════════════
  router.post('/api/auth/send-sms', [
    body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { phone } = req.body;
    const db = getDB();

    // 60秒内同号限发
    const recent = db.prepare("SELECT created_at FROM sms_codes WHERE phone = ? AND created_at > datetime('now', '-60 seconds')").get(phone);
    if (recent) {
      const seconds = Math.ceil(60 - (Date.now() - new Date(recent.created_at + 'Z').getTime()) / 1000);
      return res.status(429).json({ error: `请${Math.max(seconds, 1)}秒后再试` });
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    db.prepare('INSERT INTO sms_codes (phone, code, expires_at) VALUES (?, ?, ?)').run(phone, code, expiresAt);

    if (HAS_SMS) {
      // TODO: 接入阿里云/腾讯云短信发送
      console.log(`[SMS] 发送验证码到 ${phone}: ${code}`);
    }

    const resp = { success: true, expires_in: 300 };
    if (!HAS_SMS) {
      resp.dev_note = '短信服务未配置，开发模式显示验证码';
      resp.dev_code = code;
    }
    res.json(resp);
  });

  // ═══════════════════════════════════════
  // POST /api/auth/login-phone
  // ═══════════════════════════════════════
  router.post('/api/auth/login-phone', [
    body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { phone, password, code } = req.body;
    const db = getDB();

    // 验证码模式
    if (code) {
      const smsRow = db.prepare("SELECT * FROM sms_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1").get(phone, code);
      if (!smsRow) return res.status(400).json({ error: '验证码无效或已过期' });

      db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(smsRow.id);

      let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
      if (!user) {
        return res.json({ need_register: true, phone });
      }

      if (user.banned) return res.status(403).json({ error: '账号已被封禁' });

      const token = generateToken(user);
      setTokenCookie(res, token);
      const { password_hash, ...safeUser } = user;
      return res.json({ user: safeUser, token });
    }

    // 密码模式
    if (!password) return res.status(400).json({ error: '请输入密码或验证码' });
    if (password.length < 6) return res.status(400).json({ error: '密码至少6位' });

    const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: '手机号或密码错误' });
    }

    if (user.banned) return res.status(403).json({ error: '账号已被封禁' });

    const token = generateToken(user);
    setTokenCookie(res, token);
    const { password_hash, ...safeUser } = user;
    res.json({ user: safeUser, token });
  });

  // ═══════════════════════════════════════
  // POST /api/auth/register-phone
  // ═══════════════════════════════════════
  router.post('/api/auth/register-phone', [
    body('username').trim().isLength({ min: 2, max: 30 }).withMessage('用户名2-30个字符'),
    body('phone').matches(/^1[3-9]\d{9}$/).withMessage('请输入有效的手机号'),
    body('code').isLength({ min: 6, max: 6 }).withMessage('验证码为6位数字'),
    body('password').isLength({ min: 6 }).withMessage('密码至少6位'),
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });

    const { username, phone, code, password, email } = req.body;
    const db = getDB();

    // 验证短信码
    const smsRow = db.prepare("SELECT * FROM sms_codes WHERE phone = ? AND code = ? AND used = 0 AND expires_at > datetime('now') ORDER BY created_at DESC LIMIT 1").get(phone, code);
    if (!smsRow) return res.status(400).json({ error: '验证码无效或已过期' });

    // 检查用户名/手机号重复
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR phone = ?').get(username, phone);
    if (existing) return res.status(409).json({ error: '用户名或手机号已被注册' });

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, email, phone, phone_verified, password_hash) VALUES (?, ?, ?, 1, ?)').run(username, email || '', phone, hash);
    db.prepare('UPDATE sms_codes SET used = 1 WHERE id = ?').run(smsRow.id);

    const user = db.prepare('SELECT id, username, email, avatar, role, phone, created_at FROM users WHERE id = ?').get(db.prepare('SELECT last_insert_rowid() AS id').get().id);
    const token = generateToken(user);
    setTokenCookie(res, token);
    res.status(201).json({ user, token });
  });

  // ═══════════════════════════════════════
  // GET /api/auth/wechat/auth-url
  // ═══════════════════════════════════════
  router.get('/api/auth/wechat/auth-url', (_req, res) => {
    if (!HAS_WECHAT) {
      return res.json({ enabled: false });
    }

    const redirectUri = process.env.WECHAT_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/auth/wechat/callback`;
    const state = crypto.randomBytes(16).toString('hex');

    const url = 'https://open.weixin.qq.com/connect/qrconnect'
      + `?appid=${process.env.WECHAT_APP_ID}`
      + `&redirect_uri=${encodeURIComponent(redirectUri)}`
      + '&response_type=code'
      + '&scope=snsapi_login'
      + `&state=${state}`
      + '#wechat_redirect';

    res.json({ enabled: true, url, state });
  });

  // ═══════════════════════════════════════
  // GET /api/auth/wechat/callback
  // ═══════════════════════════════════════
  router.get('/api/auth/wechat/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
      return res.redirect('/login.html?error=wechat_cancelled');
    }

    if (!HAS_WECHAT) {
      return res.redirect('/login.html?error=wechat_disabled');
    }

    try {
      // 用 code 换取 access_token 和 openid
      const tokenUrl = 'https://api.weixin.qq.com/sns/oauth2/access_token'
        + `?appid=${process.env.WECHAT_APP_ID}`
        + `&secret=${process.env.WECHAT_APP_SECRET}`
        + `&code=${encodeURIComponent(code)}`
        + '&grant_type=authorization_code';

      const tokenRes = await fetch(tokenUrl);
      const tokenData = await tokenRes.json();

      if (tokenData.errcode) {
        console.error('[wechat] 获取access_token失败:', tokenData);
        return res.redirect('/login.html?error=wechat_failed');
      }

      const { openid, unionid } = tokenData;
      const db = getDB();

      let user = db.prepare('SELECT * FROM users WHERE wechat_openid = ?').get(openid);

      if (!user) {
        // 自动注册
        const username = 'wx_' + crypto.randomBytes(4).toString('hex');
        db.prepare('INSERT INTO users (username, email, wechat_openid, wechat_unionid, password_hash) VALUES (?, ?, ?, ?, ?)')
          .run(username, '', openid, unionid || '', '');
        user = db.prepare('SELECT * FROM users WHERE id = ?').get(db.prepare('SELECT last_insert_rowid() AS id').get().id);
      }

      const token = generateToken(user);
      setTokenCookie(res, token);

      // 重定向到首页，通过 URL 传递 token 给前端
      res.redirect(`/?wechat_token=${token}`);
    } catch (err) {
      console.error('[wechat] callback error:', err);
      res.redirect('/login.html?error=wechat_failed');
    }
  });
}

module.exports = { register };
