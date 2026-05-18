const { getDB } = require('../db');
const path = require('path');
const fs = require('fs');
const sizeOf = require('image-size');
const { optionalAuth, authMiddleware, ownerMiddleware } = require('../middleware/auth');
const { validateFile, uploadToCloudinary, deleteFromCloudinary } = require('../services/upload');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
const THUMBS_DIR = path.join(__dirname, '..', 'uploads', 'thumbs');

function ensureDirs() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (!fs.existsSync(THUMBS_DIR)) fs.mkdirSync(THUMBS_DIR, { recursive: true });
}

function isVideo(mimetype) { return mimetype && mimetype.startsWith('video/'); }

function register(router, upload) {
  // ═══════════════════════════════════════
  // GET /api/tags/trending — lightweight top tags (no full photo fetch)
  // ═══════════════════════════════════════
  router.get('/api/tags/trending', (_req, res) => {
    const db = getDB();
    const rows = db.prepare(
      "SELECT tags FROM photos WHERE status = 'approved' AND tags != '' AND tags IS NOT NULL ORDER BY download_count DESC LIMIT 40"
    ).all();
    const tagMap = {};
    rows.forEach(r => {
      (r.tags || '').split(',').forEach(t => {
        const tag = t.trim();
        if (tag) tagMap[tag] = (tagMap[tag] || 0) + 1;
      });
    });
    const tags = Object.entries(tagMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([name, count]) => ({ name, count }));
    res.json({ tags });
  });

  // ═══════════════════════════════════════
  // GET /api/photos — list with filters + pagination
  // ═══════════════════════════════════════
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

    // Mark favorites for logged-in user
    if (req.user) {
      const favIds = new Set(
        db.prepare(`SELECT photo_id FROM favorites WHERE user_id = ? AND photo_id IN (${rows.map(() => '?').join(',') || '0'})`)
          .all(req.user.id, ...rows.map(r => r.id)).map(r => r.photo_id)
      );
      rows.forEach(r => r.is_faved = favIds.has(r.id));
    }

    res.json({ photos: rows, total, page: Math.max(parseInt(page), 1), per_page: limit, total_pages: Math.ceil(total / limit) });
  });

  // ═══════════════════════════════════════
  // GET /api/photos/:id
  // ═══════════════════════════════════════
  router.get('/api/photos/:id', optionalAuth, (req, res) => {
    const db = getDB();
    const row = db.prepare(`
      SELECT p.*, a.name AS album_name, a.slug AS album_slug, u.username AS uploader_name
      FROM photos p LEFT JOIN albums a ON a.id = p.album_id LEFT JOIN users u ON u.id = p.uploader_id WHERE p.id = ?
    `).get(req.params.id);
    if (!row) return res.status(404).json({ error: '资源不存在' });
    if (req.user) {
      row.is_faved = !!db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND photo_id = ?').get(req.user.id, row.id);
    }
    res.json(row);
  });

  // ═══════════════════════════════════════
  // POST /api/photos/upload
  // ★ 必须登录 · Cloudinary优先 → 本地兜底
  // ═══════════════════════════════════════
  router.post('/api/photos/upload', authMiddleware, (req, res, next) => {
    ensureDirs();
    upload.single('photo')(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: '文件过大，图片最大 20MB，视频最大 100MB' });
        if (err.code === 'LIMIT_UNEXPECTED_FILE') return res.status(400).json({ error: '字段名必须为 "photo"' });
        return res.status(400).json({ error: err.message || '上传失败' });
      }
      if (!req.file) return res.status(400).json({ error: '请选择要上传的文件' });

      try {
        // 1. 文件类型/大小校验
        const validation = validateFile(req.file);
        if (!validation.ok) {
          try { fs.unlinkSync(req.file.path); } catch {} // 校验失败删临时文件
          return res.status(validation.status).json({ error: validation.error });
        }

        // 2. 读取尺寸（image-size 仅支持图片，视频尺寸由 Cloudinary 提供或前端读取）
        let width = 0, height = 0;
        if (!isVideo(req.file.mimetype)) {
          try { const dims = sizeOf(req.file.path); width = dims.width || 0; height = dims.height || 0; } catch {}
        }

        // 3. 尝试 Cloudinary → 失败则本地兜底
        let cloudData = null;
        let storageMode = 'local'; // 'cloudinary' | 'local'
        let finalUrl = '';
        let finalPublicId = '';
        let finalThumb = '';
        let finalSize = req.file.size;

        try {
          cloudData = await uploadToCloudinary(req.file.path, req.file.mimetype, 'wallpapers');
          storageMode = 'cloudinary';
          finalUrl = cloudData.url;
          finalPublicId = cloudData.public_id;
          finalThumb = cloudData.thumbnail || '';
          finalSize = cloudData.bytes || req.file.size;
          width = cloudData.width || width;
          height = cloudData.height || height;
          // Cloudinary 成功 → 删除本地临时文件
          try { fs.unlinkSync(req.file.path); } catch {}
        } catch (cldErr) {
          console.warn('[upload] Cloudinary 不可用，使用本地存储:', cldErr.message);
          // 本地兜底
          finalUrl = `/uploads/${req.file.filename}`;
          finalPublicId = '';
          finalThumb = '';
          storageMode = 'local';
        }

        // 4. 写入数据库
        const albumId = req.body.album_id ? parseInt(req.body.album_id) || null : null;
        const db = getDB();
        const info = db.prepare(`
          INSERT INTO photos (album_id, uploader_id, filename, original_name, media_type,
                              url, public_id, thumbnail, width, height, file_size)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          albumId, req.user.id,
          req.file.filename,          // filename — 始终存 multer 生成的本地文件名
          req.file.originalname,       // original_name
          validation.type,             // media_type
          finalUrl,                    // ★ Cloudinary URL 或 /uploads/xxx.jpg
          finalPublicId,               // ★ Cloudinary public_id（本地模式为空）
          finalThumb,                  // ★ Cloudinary 缩略图或空
          width, height,
          finalSize
        );

        const row = db.prepare('SELECT * FROM photos WHERE id = ?').get(info.lastInsertRowid);
        return res.status(201).json({ ...row, storage_mode: storageMode });

      } catch (e) {
        console.error('[upload] 错误:', e);
        try { fs.unlinkSync(req.file.path); } catch {}
        return res.status(500).json({
          error: '上传处理失败，请重试',
          detail: process.env.NODE_ENV !== 'production' ? e.message : undefined,
        });
      }
    });
  });

  // ═══════════════════════════════════════
  // PATCH /api/photos/:id
  // ═══════════════════════════════════════
  router.patch('/api/photos/:id', authMiddleware, ownerMiddleware({ ownerField: 'uploader_id', table: 'photos' }), (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    const allowedFields = { title: 'title', description: 'description', tags: 'tags', album_id: 'album_id' };
    const fields = []; const params = [];
    for (const [key, col] of Object.entries(allowedFields)) {
      if (req.body[key] !== undefined) {
        fields.push(`${col} = ?`);
        params.push(key === 'album_id' ? (req.body[key] === null ? null : parseInt(req.body[key]) || null) : req.body[key]);
      }
    }

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

  // ═══════════════════════════════════════
  // DELETE /api/photos/:id
  // ═══════════════════════════════════════
  router.delete('/api/photos/:id', authMiddleware, ownerMiddleware({ ownerField: 'uploader_id', table: 'photos' }), (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    // 从 Cloudinary 删除
    if (photo.public_id) {
      deleteFromCloudinary(photo.public_id, photo.media_type === 'video' ? 'video' : 'image').catch(() => {});
    }

    // 清理本地残留文件（兼容旧数据）
    if (photo.filename && !photo.filename.includes('/')) {
      try { fs.unlinkSync(path.join(UPLOADS_DIR, photo.filename)); } catch {}
    }
    if (photo.thumbnail && !photo.thumbnail.includes('cloudinary')) {
      try { fs.unlinkSync(path.join(THUMBS_DIR, photo.thumbnail)); } catch {}
    }

    db.prepare('DELETE FROM photos WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // ═══════════════════════════════════════
  // POST /api/photos/:id/download
  // ═══════════════════════════════════════
  router.post('/api/photos/:id/download', optionalAuth, (req, res) => {
    const db = getDB();
    const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.id);
    if (!photo) return res.status(404).json({ error: '资源不存在' });

    db.prepare('UPDATE photos SET download_count = download_count + 1 WHERE id = ?').run(req.params.id);
    if (req.user) {
      db.prepare('INSERT INTO downloads (user_id, photo_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    }

    const updated = db.prepare('SELECT download_count, url FROM photos WHERE id = ?').get(req.params.id);
    res.json({ download_count: updated.download_count, download_url: updated.url });
  });
}

module.exports = { register };
