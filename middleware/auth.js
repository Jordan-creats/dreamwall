const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET 环境变量未设置');
  }
  // 开发环境使用固定密钥
  console.warn('[auth] 警告：未设置 JWT_SECRET 环境变量，使用开发密钥');
}
const SECRET = JWT_SECRET || 'wp-dev-secret';
const TOKEN_NAME = 'wp_token';

/**
 * 从 Cookie 或 Authorization Header 提取并验证 JWT
 * Cookie 优先（HttpOnly），Header 作为降级兼容
 */
function extractToken(req) {
  // 1. HttpOnly Cookie 优先
  if (req.cookies && req.cookies[TOKEN_NAME]) {
    return req.cookies[TOKEN_NAME];
  }
  // 2. Authorization Bearer 降级（兼容旧客户端/API 调用）
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7);
  }
  return null;
}

/**
 * 必选认证 — 未登录返回 401
 */
function authMiddleware(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: '请先登录' });
  }
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期，请重新登录' });
  }
}

/**
 * 可选认证 — 不强制登录，但登录后附加用户信息
 */
function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch {}
  }
  next();
}

/**
 * 管理员权限 — 需在 authMiddleware 之后调用
 */
function adminMiddleware(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

/**
 * 资源归属校验 — 用户只能操作自己的资源（或管理员）
 * options.ownerField  — 数据库中的 owner 字段名（默认 uploader_id）
 * options.paramName   — URL 参数名（默认 id）
 * options.table       — 数据库表名（默认 photos）
 */
function ownerMiddleware(options = {}) {
  const { ownerField = 'uploader_id', paramName = 'id', table = 'photos' } = options;
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: '请先登录' });
    if (req.user.role === 'admin') return next(); // 管理员跳过

    const { getDB } = require('../db');
    const db = getDB();
    const resourceId = req.params[paramName];
    const row = db.prepare(`SELECT ${ownerField} FROM ${table} WHERE id = ?`).get(resourceId);
    if (!row) return res.status(404).json({ error: '资源不存在' });
    if (row[ownerField] !== req.user.id) {
      return res.status(403).json({ error: '无权操作此资源' });
    }
    next();
  };
}

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  );
}

/**
 * 设置 HttpOnly Cookie
 */
function setTokenCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(TOKEN_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
  });
}

function clearTokenCookie(res) {
  res.clearCookie(TOKEN_NAME, { path: '/' });
}

module.exports = {
  authMiddleware,
  optionalAuth,
  adminMiddleware,
  ownerMiddleware,
  generateToken,
  setTokenCookie,
  clearTokenCookie,
  SECRET,
  TOKEN_NAME,
};
