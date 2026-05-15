const express = require('express');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const crypto = require('crypto');
const { initDB } = require('./db');
const { initCloudinary } = require('./config/cloudinary');

// ── Route modules ────────────────────
const albums = require('./routes/albums');
const photos = require('./routes/photos');
const auth   = require('./routes/auth');
const admin  = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// ════════════════════════════════════
// SECURITY
// ════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com", "https://*.cloudinary.com"],
      connectSrc: ["'self'", "https://api.cloudinary.com"],
      fontSrc: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'same-site' },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
app.use(limiter);

// Auth endpoints rate limit (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录尝试过于频繁，请15分钟后再试' },
});

// Upload rate limit
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '上传过于频繁，请稍后再试' },
});

// ════════════════════════════════════
// LOGGING
// ════════════════════════════════════
if (!isProd) app.use(morgan('dev'));

// ════════════════════════════════════
// MULTER
// ════════════════════════════════════
const { ALLOWED } = require('./services/upload');

const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const name = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext || '.jpg'}`;
      cb(null, name);
    }
  }),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [...ALLOWED.image, ...ALLOWED.video];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型，仅支持 JPG/PNG/WebP/GIF/MP4/WebM'));
    }
  }
});

// ════════════════════════════════════
// MIDDLEWARE
// ════════════════════════════════════
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser()); // ★ 解析 Cookie → req.cookies

// Static assets with caching
const staticOpts = isProd ? { maxAge: '7d', immutable: true } : {};
app.use(express.static(path.join(__dirname, 'public'), staticOpts));

// 本地 uploads — 始终开启作为兜底（Cloudinary 优先，本地兼容旧数据）
const cld = initCloudinary();
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  ...staticOpts,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.mp4') || filePath.endsWith('.webm')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));
if (!cld) {
  console.log('[server] Cloudinary 未配置 — 上传将使用本地存储');
} else {
  console.log('[server] Cloudinary 已配置 — 上传优先使用 CDN，本地作为兜底');
}

// ════════════════════════════════════
// API ROUTES
// ════════════════════════════════════
const router = express.Router();
albums.register(router);
photos.register(router, upload);
auth.register(router);
admin.register(router);

// Apply stricter rate limits to auth endpoints
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/photos/upload', uploadLimiter);

app.use(router);

// ════════════════════════════════════
// SEO FILES
// ════════════════════════════════════
app.get('/robots.txt', (_req, res) => {
  res.type('text/plain');
  res.send(`User-agent: *
Allow: /
Disallow: /api/
Disallow: /uploads/
Sitemap: ${process.env.SITE_URL || (isProd ? 'https://yourdomain.com' : 'http://localhost:' + PORT)}/sitemap.xml`);
});

app.get('/sitemap.xml', (_req, res) => {
  const db = require('./db').getDB();
  const photos = db.prepare("SELECT id, created_at FROM photos WHERE status = 'approved' ORDER BY created_at DESC LIMIT 5000").all();
  const base = process.env.SITE_URL || (isProd ? 'https://yourdomain.com' : `http://localhost:${PORT}`);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
  xml += `  <url><loc>${base}</loc><changefreq>daily</changefreq><priority>1.0</priority></url>\n`;
  photos.forEach(p => {
    xml += `  <url><loc>${base}/photo/${p.id}</loc><lastmod>${p.created_at}</lastmod><changefreq>weekly</changefreq><priority>0.7</priority></url>\n`;
  });
  xml += '</urlset>';
  res.type('application/xml');
  res.send(xml);
});

// ════════════════════════════════════
// SPA FALLBACK
// ════════════════════════════════════
app.get('/{*any}', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ════════════════════════════════════
// ERROR HANDLER
// ════════════════════════════════════
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.type === 'entity.too.large') return res.status(413).json({ error: '请求体过大' });
  res.status(err.status || 500).json({ error: isProd ? '服务器内部错误' : err.message });
});

// ════════════════════════════════════
// START
// ════════════════════════════════════
initDB();
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

module.exports = app;
