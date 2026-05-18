var urlParams = new URLSearchParams(window.location.search);
var username = urlParams.get('u') || (function() {
  try { return JSON.parse(localStorage.getItem('wp_user')).username; } catch (e) { return null; }
})();

if (!username) { window.location.href = '/login.html'; }

document.title = username + ' · 光影集';

var currentTab = 'uploads';

async function load() {
  try {
    var res = await fetch('/api/user/' + username);
    var data = await res.json();
    if (!res.ok) { document.body.innerHTML = '<div class="empty-state" style="padding:100px"><h3>用户不存在</h3></div>'; return; }

    document.getElementById('profileAvatar').textContent = data.user.username.charAt(0).toUpperCase();
    document.getElementById('profileName').textContent = data.user.username;
    document.getElementById('profileRole').textContent = data.user.role === 'admin' ? '管理员' : '注册用户';
    document.getElementById('statUploads').textContent = data.user.uploads;
    document.getElementById('statFavs').textContent = data.user.favorites;
    document.getElementById('statDls').textContent = data.user.downloads;

    renderPhotos(data.photos);
  } catch (e) { document.body.innerHTML = '<div class="empty-state" style="padding:100px"><h3>加载失败</h3></div>'; }
}

function renderPhotos(photos) {
  var grid = document.getElementById('profileGrid');
  if (!photos.length) { grid.innerHTML = '<div class="empty-profile">暂无壁纸</div>'; return; }
  grid.innerHTML = photos.map(function(p) {
    return '<div class="profile-card" data-action="open-wallpaper" data-src="' + getSrc(p).replace(/"/g, '&quot;') + '">' +
      '<img src="' + getSrc(p) + '" alt="' + escapeHtml(p.title || p.original_name) + '" loading="lazy" />' +
      '<div class="pc-body">' +
        '<div class="pc-title">' + escapeHtml(p.title || p.original_name) + '</div>' +
        '<div class="pc-meta">⬇ ' + (p.download_count || 0) + ' · ' + (p.album_name || '未分类') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');
}

// Profile grid click delegation — replaces inline onclick
document.getElementById('profileGrid').addEventListener('click', function(e) {
  var card = e.target.closest('[data-action="open-wallpaper"]');
  if (card) { window.open(card.dataset.src, '_blank'); }
});

// Tab switching
document.querySelectorAll('[data-tab]').forEach(function(btn) {
  btn.addEventListener('click', async function() {
    document.querySelectorAll('[data-tab]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    currentTab = btn.dataset.tab;

    if (currentTab === 'favorites') {
      try {
        var meRes = await fetch('/api/auth/me');
        if (!meRes.ok) { document.getElementById('profileGrid').innerHTML = '<div class="empty-profile">需要登录才能查看收藏</div>'; return; }
        var res = await fetch('/api/auth/favorites');
        var data = await res.json();
        renderPhotos(data.photos || []);
      } catch (e) { document.getElementById('profileGrid').innerHTML = '<div class="empty-profile">加载失败</div>'; }
    } else {
      load();
    }
  });
});

load();
