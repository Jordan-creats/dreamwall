var adminUser = null;
var headers = { 'Content-Type': 'application/json' };

async function checkAdmin() {
  try {
    var res = await fetch('/api/auth/me', { headers: headers });
    if (!res.ok) { window.location.href = '/login.html'; return false; }
    adminUser = await res.json();
    if (adminUser.role !== 'admin') { alert('需要管理员权限'); window.location.href = '/'; return false; }
    return true;
  } catch (e) { window.location.href = '/login.html'; return false; }
}

function $(s) { return document.getElementById(s); }
var alertBox, photoStatusFilter = 'all', photoSearchTimer;

setTimeout(function() { alertBox = $('alertBox'); }, 0);

function alertMsg(msg, ok) {
  if (!$('alertBox')) return;
  $('alertBox').innerHTML = '<div class="alert ' + (ok ? 'alert-ok' : 'alert-err') + '">' + msg + '</div>';
  setTimeout(function() { if ($('alertBox')) $('alertBox').innerHTML = ''; }, 3000);
}

async function api(url, opts) {
  opts = opts || {};
  var res = await fetch(url, { headers: headers, ...opts });
  if (res.status === 401) { window.location.href = '/login.html'; return; }
  if (res.status === 403) { alertMsg('无管理员权限', false); return null; }
  var data = await res.json();
  if (!res.ok) { alertMsg(data.error || '操作失败', false); throw new Error(data.error); }
  return data;
}

// ── Navigation ──────────────────────
document.querySelectorAll('.admin-nav a[data-section]').forEach(function(a) {
  a.addEventListener('click', function(e) {
    e.preventDefault();
    document.querySelectorAll('.admin-nav a').forEach(function(x) { x.classList.remove('active'); });
    a.classList.add('active');
    document.querySelectorAll('.section').forEach(function(s) { s.classList.remove('active'); });
    $('sec-' + a.dataset.section).classList.add('active');
    var loaders = { dashboard: loadDashboard, photos: loadPhotos, banners: loadBanners, albums: loadAlbums, users: loadUsers, logs: loadLogs };
    if (loaders[a.dataset.section]) loaders[a.dataset.section]();
  });
});

// ═══════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════
async function loadDashboard() {
  var stats = await api('/api/admin/stats');
  if (!stats) return;
  $('statsGrid').innerHTML = [
    { n: stats.photos, l: '壁纸总数', cls: '' },
    { n: stats.videos, l: '动态壁纸', cls: '' },
    { n: stats.pending, l: '待审核', cls: 'warn' },
    { n: stats.featured, l: '推荐位', cls: '' },
    { n: stats.users, l: '用户数', cls: '' },
    { n: stats.banned, l: '已封禁', cls: 'danger' },
    { n: stats.downloads, l: '总下载', cls: '' },
    { n: stats.albums, l: '分类数', cls: '' },
  ].map(function(s) {
    return '<div class="stat-card ' + s.cls + '"><div class="num">' + s.n + '</div><div class="lbl">' + s.l + '</div></div>';
  }).join('');

  var max = Math.max(stats.today_uploads, stats.today_downloads, stats.today_registrations, 1);
  $('barChart').innerHTML = [
    { v: stats.today_uploads, l: '上传', color: '#a855f7' },
    { v: stats.today_downloads, l: '下载', color: '#6366f1' },
    { v: stats.today_registrations, l: '注册', color: '#4ade80' },
  ].map(function(b) {
    var h = Math.max((b.v / max) * 120, 2);
    return '<div class="bar-item"><div class="bar-value">' + b.v + '</div><div class="bar" style="height:' + h + 'px;background:' + b.color + '"></div><div class="bar-label">' + b.l + '</div></div>';
  }).join('');

  try {
    var logData = await api('/api/admin/logs?per_page=6');
    $('recentLogs').innerHTML = (logData && logData.logs ? logData.logs : []).map(function(l) {
      return '<div class="log-entry"><span class="log-action">' + actionLabel(l.action) + '</span><span class="log-detail">' + (l.detail || '') + '</span><span class="log-time">' + (l.created_at || '').slice(5, 16) + '</span></div>';
    }).join('') || '<div class="empty-state">暂无操作记录</div>';
  } catch (e) { console.error('[admin recentLogs]', e); }
}

function actionLabel(a) {
  var map = { approve_photo: '✅ 通过', reject_photo: '❌ 拒绝', feature_photo: '⭐ 推荐', unfeature_photo: '取消推荐',
    delete_photo: '🗑️ 删除', batch_review: '📦 批量审核', create_album: '📁 创建分类', delete_album: '🗑️ 删除分类',
    ban_user: '🚫 封禁', unban_user: '✅ 解封', change_role: '👑 改角色', delete_user: '🗑️ 删用户',
    create_banner: '🎯 建Banner', update_banner: '✏️ 改Banner', delete_banner: '🗑️ 删Banner',
    update_tags: '🏷️ 改标签', update_album: '✏️ 改分类' };
  return map[a] || a;
}

// ═══════════════════════════════════════
// PHOTOS
// ═══════════════════════════════════════
async function loadPhotos() {
  var search = $('photoSearch').value.trim();
  var statusQ = photoStatusFilter === 'all' ? '' : '&status=' + photoStatusFilter;
  var searchQ = search ? '&search=' + encodeURIComponent(search) : '';
  var data = await api('/api/admin/photos?per_page=30' + statusQ + searchQ);
  if (!data) return;
  $('photosTable').innerHTML = !data.photos.length ? '<div class="empty-state">暂无内容</div>'
    : '<table class="data-table"><thead><tr>' +
      '<th><input type="checkbox" id="selectAll" /></th><th>预览</th><th>标题</th><th>类型</th><th>状态</th><th>推荐</th><th>上传者</th><th>操作</th>' +
    '</tr></thead><tbody>' + data.photos.map(function(p) {
      return '<tr data-photo-id="' + p.id + '">' +
        '<td><input type="checkbox" class="photo-check" value="' + p.id + '" /></td>' +
        '<td><img src="' + getSrc(p) + '" style="width:60px;height:40px;object-fit:cover;border-radius:4px" /></td>' +
        '<td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + escapeHtml(p.title || p.original_name) + '</td>' +
        '<td>' + (p.media_type === 'video' ? '🎬' : '🖼️') + '</td>' +
        '<td><span class="badge badge-' + (p.status === 'approved' ? 'green' : p.status === 'pending' ? 'yellow' : 'red') + '">' + (p.status === 'approved' ? '通过' : p.status === 'pending' ? '待审' : '拒绝') + '</span></td>' +
        '<td>' + (p.featured ? '⭐' : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
        '<td>' + (p.uploader_name || '—') + '</td>' +
        '<td style="white-space:nowrap">' +
          (p.status !== 'approved' ? '<button class="btn-primary btn-sm" data-action="review-photo" data-id="' + p.id + '" data-status="approved">通过</button> ' : '') +
          (p.status !== 'rejected' ? '<button class="btn-glass btn-sm" data-action="review-photo" data-id="' + p.id + '" data-status="rejected">拒绝</button> ' : '') +
          '<button class="btn-glass btn-sm" data-action="toggle-feature" data-id="' + p.id + '" data-featured="' + (p.featured || 0) + '">' + (p.featured ? '取消推荐' : '⭐推荐') + '</button>' +
          '<button class="btn-glass btn-sm" data-action="edit-tags" data-id="' + p.id + '" data-tags="' + (p.tags || '').replace(/"/g, '&quot;') + '">🏷️</button>' +
          '<button class="btn-glass btn-sm" data-action="del-photo" data-id="' + p.id + '" style="color:#f87171">删除</button>' +
        '</td>' +
      '</tr>';
    }).join('') + '</tbody></table>' +
    '<div class="admin-toolbar" style="margin-top:12px">' +
      '<button class="btn-primary btn-sm" data-action="batch-review" data-status="approved">批量通过</button>' +
      '<button class="btn-glass btn-sm" data-action="batch-review" data-status="rejected">批量拒绝</button>' +
      '<span style="font-size:.78rem;color:var(--text-muted)" id="selectedCount"></span>' +
    '</div>';

  // Status filter chips
  document.querySelectorAll('#sec-photos [data-status]').forEach(function(chip) {
    chip.onclick = function() {
      document.querySelectorAll('#sec-photos [data-status]').forEach(function(c) { c.classList.remove('active'); });
      chip.classList.add('active'); photoStatusFilter = chip.dataset.status; loadPhotos();
    };
  });

  // Select all
  var selectAllEl = document.getElementById('selectAll');
  if (selectAllEl) {
    selectAllEl.addEventListener('change', function(e) {
      document.querySelectorAll('.photo-check').forEach(function(cb) { cb.checked = e.target.checked; });
    });
  }
}

// ★ Event delegation for photo action buttons
document.getElementById('photosTable').addEventListener('click', async function(e) {
  var btn = e.target.closest('button[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  var id = btn.dataset.id;

  if (action === 'review-photo') {
    await api('/api/admin/photos/' + id + '/review', { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) });
    loadPhotos(); loadDashboard();
  } else if (action === 'toggle-feature') {
    await api('/api/admin/photos/' + id + '/feature', { method: 'PATCH', body: JSON.stringify({ featured: btn.dataset.featured === '1' ? 0 : 1 }) });
    loadPhotos();
  } else if (action === 'del-photo') {
    if (!confirm('确定删除？')) return;
    await api('/api/admin/photos/' + id, { method: 'DELETE' });
    loadPhotos(); loadDashboard();
  } else if (action === 'edit-tags') {
    var tags = prompt('输入标签（逗号分隔）', btn.dataset.tags);
    if (tags === null) return;
    await api('/api/admin/photos/' + id + '/tags', { method: 'PATCH', body: JSON.stringify({ tags: tags }) });
    loadPhotos();
  } else if (action === 'batch-review') {
    var status = btn.dataset.status;
    var ids = [].map.call(document.querySelectorAll('.photo-check:checked'), function(cb) { return parseInt(cb.value); });
    if (!ids.length) { alert('请勾选图片'); return; }
    if (!confirm('确定将 ' + ids.length + ' 张图片' + (status === 'approved' ? '通过' : '拒绝') + '？')) return;
    await api('/api/admin/photos/batch-review', { method: 'POST', body: JSON.stringify({ ids: ids, status: status }) });
    loadPhotos(); loadDashboard();
  }
});

var photoSearchEl = document.getElementById('photoSearch');
if (photoSearchEl) {
  photoSearchEl.addEventListener('input', function() { clearTimeout(photoSearchTimer); photoSearchTimer = setTimeout(loadPhotos, 400); });
}

// ═══════════════════════════════════════
// BANNERS
// ═══════════════════════════════════════
async function loadBanners() {
  var banners = await api('/api/admin/banners');
  if (!banners) return;
  $('bannerGrid').innerHTML = !banners.length ? '<div class="empty-state">暂无 Banner</div>'
    : banners.map(function(b) {
      return '<div class="banner-card">' +
        '<img src="' + b.image_url + '" alt="' + (b.title || '') + '" />' +
        '<div class="bc-body">' +
          '<div class="t">' + (b.title || '无标题') + '</div>' +
          '<div class="m">' + (b.is_active ? '✅ 启用' : '⏸ 停用') + ' · 排序: ' + b.sort_order + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:4px">' +
            '<button class="btn-glass btn-sm" data-action="edit-banner" data-id="' + b.id + '" data-title="' + (b.title || '').replace(/"/g, '&quot;') + '" data-image="' + b.image_url + '" data-link="' + (b.link_url || '').replace(/"/g, '&quot;') + '" data-sort="' + b.sort_order + '" data-active="' + (b.is_active ? '1' : '0') + '">编辑</button>' +
            '<button class="btn-glass btn-sm" data-action="del-banner" data-id="' + b.id + '" style="color:#f87171">删除</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
}

// ★ Event delegation for banner actions
document.getElementById('bannerGrid').addEventListener('click', function(e) {
  var btn = e.target.closest('button[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'edit-banner') {
    $('bannerEditId').value = btn.dataset.id;
    $('bannerTitle').value = btn.dataset.title;
    $('bannerImage').value = btn.dataset.image;
    $('bannerLink').value = btn.dataset.link;
    $('bannerForm').style.display = '';
  } else if (btn.dataset.action === 'del-banner') {
    if (!confirm('确定删除？')) return;
    api('/api/admin/banners/' + btn.dataset.id, { method: 'DELETE' }).then(loadBanners);
  }
});

$('addBannerBtn').addEventListener('click', function() {
  $('bannerForm').style.display = ''; $('bannerEditId').value = '';
  $('bannerTitle').value = ''; $('bannerImage').value = ''; $('bannerLink').value = '';
});
$('bannerCancel').addEventListener('click', function() { $('bannerForm').style.display = 'none'; });
$('bannerSave').addEventListener('click', async function() {
  var image_url = $('bannerImage').value.trim();
  if (!image_url) { alert('图片 URL 必填'); return; }
  var body = { title: $('bannerTitle').value.trim(), image_url: image_url, link_url: $('bannerLink').value.trim(), sort_order: 0, is_active: 1 };
  var editId = $('bannerEditId').value;
  if (editId) { await api('/api/admin/banners/' + editId, { method: 'PATCH', body: JSON.stringify(body) }); }
  else { await api('/api/admin/banners', { method: 'POST', body: JSON.stringify(body) }); }
  $('bannerForm').style.display = 'none'; loadBanners();
});

// ═══════════════════════════════════════
// ALBUMS
// ═══════════════════════════════════════
async function loadAlbums() {
  var albums = await api('/api/admin/albums');
  if (!albums) return;
  $('albumsTable').innerHTML = !albums.length ? '<div class="empty-state">暂无分类</div>'
    : '<table class="data-table"><thead><tr><th>名称</th><th>标识</th><th>描述</th><th>图片数</th><th>操作</th></tr></thead><tbody>' +
      albums.map(function(a) { return '<tr>' +
        '<td>' + a.name + '</td><td>' + a.slug + '</td><td style="color:var(--text-muted)">' + (a.description || '—') + '</td><td>' + a.photo_count + '</td>' +
        '<td><button class="btn-glass btn-sm" data-action="del-album" data-id="' + a.id + '" style="color:#f87171">删除</button></td>' +
      '</tr>'; }).join('') + '</tbody></table>';
}

// ★ Event delegation for album actions
document.getElementById('albumsTable').addEventListener('click', function(e) {
  var btn = e.target.closest('button[data-action="del-album"]');
  if (!btn) return;
  if (!confirm('删除后图片变为未分类。确定？')) return;
  api('/api/admin/albums/' + btn.dataset.id, { method: 'DELETE' }).then(function() { loadAlbums(); loadDashboard(); });
});

$('addAlbumBtn').addEventListener('click', async function() {
  var name = $('newAlbumName').value.trim();
  if (!name) { alert('请输入分类名'); return; }
  await api('/api/admin/albums', { method: 'POST', body: JSON.stringify({ name: name, description: $('newAlbumDesc').value.trim() }) });
  $('newAlbumName').value = ''; $('newAlbumDesc').value = ''; loadAlbums(); loadDashboard();
});

// ═══════════════════════════════════════
// USERS
// ═══════════════════════════════════════
var userSearchEl = document.getElementById('userSearch');
if (userSearchEl) {
  userSearchEl.addEventListener('input', async function() { await loadUsers(); });
}

async function loadUsers() {
  var search = $('userSearch').value.trim();
  var q = search ? '&search=' + encodeURIComponent(search) : '';
  var data = await api('/api/admin/users?per_page=100' + q);
  if (!data) return;
  $('usersTable').innerHTML = !data.users.length ? '<div class="empty-state">暂无用户</div>'
    : '<table class="data-table"><thead><tr><th>ID</th><th>用户名</th><th>邮箱</th><th>角色</th><th>状态</th><th>上传</th><th>注册时间</th><th>操作</th></tr></thead><tbody>' +
      data.users.map(function(u) { return '<tr>' +
        '<td>' + u.id + '</td><td>' + u.username + '</td><td>' + u.email + '</td>' +
        '<td><span class="badge ' + (u.role === 'admin' ? 'badge-purple' : '') + '">' + (u.role === 'admin' ? '管理员' : '用户') + '</span></td>' +
        '<td>' + (u.banned ? '<span class="badge badge-red">已封禁</span>' : '<span class="badge badge-green">正常</span>') + '</td>' +
        '<td>' + u.photo_count + '</td>' +
        '<td>' + (u.created_at || '').slice(0, 10) + '</td>' +
        '<td style="white-space:nowrap">' +
          '<button class="btn-glass btn-sm" data-action="toggle-role" data-id="' + u.id + '" data-role="' + u.role + '">' + (u.role === 'admin' ? '降级' : '升管理员') + '</button>' +
          '<button class="btn-glass btn-sm" data-action="toggle-ban" data-id="' + u.id + '" data-banned="' + (u.banned || 0) + '">' + (u.banned ? '解封' : '封禁') + '</button>' +
          (u.role !== 'admin' ? '<button class="btn-glass btn-sm" data-action="del-user" data-id="' + u.id + '" style="color:#f87171">删除</button>' : '') +
        '</td>' +
      '</tr>'; }).join('') + '</tbody></table>';
}

// ★ Event delegation for user actions
document.getElementById('usersTable').addEventListener('click', async function(e) {
  var btn = e.target.closest('button[data-action]');
  if (!btn) return;
  var action = btn.dataset.action;
  var id = btn.dataset.id;

  if (action === 'toggle-role') {
    await api('/api/admin/users/' + id + '/role', { method: 'PATCH', body: JSON.stringify({ role: btn.dataset.role === 'admin' ? 'user' : 'admin' }) });
    loadUsers();
  } else if (action === 'toggle-ban') {
    var reason = btn.dataset.banned === '1' ? '' : (prompt('封禁原因（可选）') || '');
    await api('/api/admin/users/' + id + '/ban', { method: 'PATCH', body: JSON.stringify({ banned: btn.dataset.banned === '1' ? 0 : 1, reason: reason }) });
    loadUsers(); loadDashboard();
  } else if (action === 'del-user') {
    if (!confirm('确定删除该用户及其上传内容？')) return;
    await api('/api/admin/users/' + id, { method: 'DELETE' });
    loadUsers(); loadDashboard();
  }
});

// ═══════════════════════════════════════
// LOGS
// ═══════════════════════════════════════
async function loadLogs() {
  var data = await api('/api/admin/logs?per_page=80');
  if (!data) return;
  $('logsTable').innerHTML = !data.logs.length ? '<div class="empty-state">暂无操作记录</div>'
    : data.logs.map(function(l) {
      return '<div class="log-entry">' +
        '<span class="log-time">' + (l.created_at || '').slice(5, 16) + '</span>' +
        '<span class="log-action">' + actionLabel(l.action) + '</span>' +
        '<span class="log-detail">' + (l.detail || '') + ' ' + (l.admin_name ? 'by ' + l.admin_name : '') + '</span>' +
      '</div>';
    }).join('');
}

// Init
checkAdmin().then(function(ok) { if (ok) loadDashboard(); });
