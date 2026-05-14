const { getDB } = require('../db');

function register(router) {
  router.get('/api/albums', (_req, res) => {
    const db = getDB();
    const rows = db.prepare(`
      SELECT a.*, COUNT(p.id) AS photo_count
      FROM albums a
      LEFT JOIN photos p ON p.album_id = a.id
      GROUP BY a.id
      ORDER BY a.id
    `).all();
    res.json(rows);
  });

  router.post('/api/albums', (req, res) => {
    const db = getDB();
    const { name, description } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: '相册名称不能为空' });

    let slug = req.body.slug || name;
    // Generate slug: lowercase, replace non-alnum with hyphens
    if (!req.body.slug) {
      slug = name.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, '-').replace(/^-|-$/g, '');
      if (!slug) slug = 'album';
    }

    try {
      const info = db.prepare('INSERT INTO albums (name, slug, description) VALUES (?, ?, ?)').run(name.trim(), slug, description || '');
      res.status(201).json({ id: info.lastInsertRowid, name: name.trim(), slug, description: description || '' });
    } catch (err) {
      if (err.message.includes('UNIQUE')) return res.status(409).json({ error: '相册标识已存在' });
      throw err;
    }
  });
}

module.exports = { register };
