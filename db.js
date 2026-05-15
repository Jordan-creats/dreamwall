const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'gallery.db');

let db;

function initDB() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      avatar        TEXT DEFAULT '',
      role          TEXT DEFAULT 'user',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS albums (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS photos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      album_id       INTEGER DEFAULT NULL REFERENCES albums(id) ON DELETE SET NULL,
      uploader_id    INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      filename       TEXT NOT NULL,
      original_name  TEXT NOT NULL,
      title          TEXT DEFAULT '',
      description    TEXT DEFAULT '',
      tags           TEXT DEFAULT '',
      media_type     TEXT DEFAULT 'image',
      thumbnail      TEXT DEFAULT '',
      width          INTEGER DEFAULT 0,
      height         INTEGER DEFAULT 0,
      duration       REAL DEFAULT 0,
      file_size      INTEGER DEFAULT 0,
      download_count INTEGER DEFAULT 0,
      status         TEXT DEFAULT 'pending',
      created_at     TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, photo_id)
    );

    CREATE TABLE IF NOT EXISTS downloads (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
      photo_id   INTEGER NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS banners (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT DEFAULT '',
      image_url   TEXT NOT NULL,
      link_url    TEXT DEFAULT '',
      sort_order  INTEGER DEFAULT 0,
      is_active   INTEGER DEFAULT 1,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action      TEXT NOT NULL,
      target_type TEXT DEFAULT '',
      target_id   INTEGER DEFAULT 0,
      detail      TEXT DEFAULT '',
      created_at  TEXT DEFAULT (datetime('now'))
    );
  `);

  // ── Migration: new columns ─────────────
  const photoCols = db.prepare("PRAGMA table_info('photos')").all().map(c => c.name);
  if (!photoCols.includes('featured')) db.exec("ALTER TABLE photos ADD COLUMN featured INTEGER DEFAULT 0");
  if (!photoCols.includes('sort_order')) db.exec("ALTER TABLE photos ADD COLUMN sort_order INTEGER DEFAULT 0");

  const userCols = db.prepare("PRAGMA table_info('users')").all().map(c => c.name);
  if (!userCols.includes('banned')) db.exec("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0");
  if (!userCols.includes('banned_reason')) db.exec("ALTER TABLE users ADD COLUMN banned_reason TEXT DEFAULT ''");

  // Migration: add columns to existing tables if missing (continued)
  if (!photoCols.includes('media_type')) db.exec("ALTER TABLE photos ADD COLUMN media_type TEXT DEFAULT 'image'");
  if (!photoCols.includes('thumbnail')) db.exec("ALTER TABLE photos ADD COLUMN thumbnail TEXT DEFAULT ''");
  if (!photoCols.includes('duration')) db.exec("ALTER TABLE photos ADD COLUMN duration REAL DEFAULT 0");
  if (!photoCols.includes('uploader_id')) db.exec("ALTER TABLE photos ADD COLUMN uploader_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL");
  if (!photoCols.includes('status')) db.exec("ALTER TABLE photos ADD COLUMN status TEXT DEFAULT 'approved'");
  if (!photoCols.includes('url')) db.exec("ALTER TABLE photos ADD COLUMN url TEXT DEFAULT ''");
  if (!photoCols.includes('public_id')) db.exec("ALTER TABLE photos ADD COLUMN public_id TEXT DEFAULT ''");

  // Seed default albums
  const albumCount = db.prepare('SELECT COUNT(*) AS c FROM albums').get();
  if (albumCount.c === 0) {
    const insert = db.prepare('INSERT INTO albums (name, slug, description) VALUES (?, ?, ?)');
    const seeds = [
      ['动漫', 'anime', '二次元世界的绮丽幻想，番剧壁纸精选'],
      ['风景', 'scenery', '山川湖海，日月星辰，大自然的壮美画卷'],
      ['美女', 'girl', '清纯甜美，气质优雅，视觉美学之选'],
      ['科技', 'tech', '未来感十足的科幻壁纸与数码艺术'],
      ['游戏', 'game', '3A大作与独立游戏的视觉盛宴'],
      ['萌宠', 'pet', '治愈系毛孩子，可爱暴击每一天'],
      ['动态壁纸', 'live', '高清视频壁纸，让桌面动起来'],
      ['抽象艺术', 'abstract', '色彩、线条与构图的无限想象'],
    ];
    db.transaction(() => { for (const s of seeds) insert.run(...s); })();
  }

  // Seed admin user if no users exist
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (userCount.c === 0) {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)').run('admin', 'admin@example.com', hash, 'admin');
  }

  return db;
}

function getDB() {
  if (!db) throw new Error('Database not initialized. Call initDB() first.');
  return db;
}

module.exports = { initDB, getDB };
