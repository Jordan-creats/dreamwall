var period = 'all';

async function loadRanking() {
  var timeParam = period === 'all' ? '' : '&time=' + period;
  try {
    var res = await fetch('/api/photos?sort=popular&per_page=50' + timeParam);
    var data = await res.json();
    var photos = data.photos || [];

    document.getElementById('rankList').innerHTML = photos.map(function(p, i) {
      return '<a href="/wallpaper.html?id=' + p.id + '" class="rank-item">' +
        '<div class="rank-num">' + (i + 1) + '</div>' +
        '<img class="rank-thumb" src="' + getSrc(p) + '" alt="" loading="lazy" />' +
        '<div class="rank-info">' +
          '<h3>' + escapeHtml(p.title || p.original_name) + '</h3>' +
          '<div class="meta">' + p.width + '×' + p.height + ' · ' + (p.album_name || '未分类') + ' · ' + (p.media_type === 'video' ? '🎬 动态' : '🖼️ 静态') + '</div>' +
        '</div>' +
        '<div class="rank-stats">' +
          '<div class="dl">' + (p.download_count || 0) + '</div>' +
          '<div class="lbl">次下载</div>' +
        '</div>' +
      '</a>';
    }).join('') || '<p style="text-align:center;color:var(--text-muted);padding:40px">暂无数据</p>';
  } catch (e) { console.error('[popular loadRanking]', e); }
}

document.querySelectorAll('[data-period]').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('[data-period]').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    period = btn.dataset.period;
    loadRanking();
  });
});

loadRanking();
