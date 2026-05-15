import * as API from './api.js';
import * as Store from './store.js';
import { formatDate, formatSize, formatDuration, toast, escapeHtml } from './utils.js';
import { isViewOnly, showLoginPrompt } from './upload.js';

let currentIdx = -1;

const $ = (id) => document.getElementById(id);

// ★ Cloudinary URL 优先 → 本地降级
function getModalSrc(p) {
  return p.url || `/uploads/${p.filename}`;
}

// ── Image preloading ────────────────
const preloadCache = new Set();
function preload(url) {
  if (!url || preloadCache.has(url)) return;
  preloadCache.add(url);
  const link = document.createElement('link');
  link.rel = 'preload'; link.as = 'image'; link.href = url;
  document.head.appendChild(link);
}
export function openModal(idx, fullSrc) {
  const photos = Store.getPhotos();
  if (idx < 0 || idx >= photos.length) return;
  currentIdx = idx;
  showContent(fullSrc);
  $('modal').classList.add('open');
  document.body.style.overflow = 'hidden';

  const p = photos[idx];
  if (p.media_type === 'video') {
    $('modalVideo').play().catch(() => {});
  }

  // ★ Preload adjacent images for instant prev/next
  if (idx + 1 < photos.length) preload(getModalSrc(photos[idx + 1]));
  if (idx - 1 >= 0) preload(getModalSrc(photos[idx - 1]));
}

export function closeModal() {
  $('modalVideo').pause();
  $('modalVideo').src = '';
  $('modal').classList.remove('open');
  document.body.style.overflow = '';
  currentIdx = -1;
}

export function prev() { const photos = Store.getPhotos(); currentIdx = (currentIdx - 1 + photos.length) % photos.length; showContent(); }
export function next() { const photos = Store.getPhotos(); currentIdx = (currentIdx + 1) % photos.length; showContent(); }

function showContent(preloadedSrc) {
  const photos = Store.getPhotos();
  if (currentIdx < 0 || currentIdx >= photos.length) return;
  const p = photos[currentIdx];
  const isVideo = p.media_type === 'video';
  const faved = Store.isFaved(p.id);

  // ★ 使用预加载的大图 URL，弹窗秒开
  const fullSrc = preloadedSrc || getModalSrc(p);

  const img = $('modalImg');
  const vid = $('modalVideo');
  if (isVideo) {
    img.style.display = 'none';
    vid.style.display = '';
    vid.querySelector('source').src = fullSrc;
    vid.load();
    vid.play().catch(() => {});
    $('modalVideoControls').style.display = '';
  } else {
    vid.style.display = 'none';
    vid.pause();
    img.style.display = '';
    img.src = fullSrc;
    $('modalVideoControls').style.display = 'none';
  }

  // Badge
  const badge = $('modalBadge');
  if (isVideo) { badge.className = 'modal-badge video'; badge.textContent = '🎬 动态壁纸'; badge.style.display = ''; }
  else { badge.className = 'modal-badge image'; badge.textContent = '🖼️ 静态壁纸'; badge.style.display = ''; }

  // Info
  $('modalTitle').textContent = p.title || p.original_name;
  $('modalDesc').textContent = p.description || '';
  $('infoType').textContent = isVideo ? '动态壁纸' : '静态壁纸';
  $('infoRes').textContent = `${p.width} × ${p.height}`;
  $('infoSize').textContent = formatSize(p.file_size);
  $('infoDownloads').textContent = p.download_count;
  $('infoDate').textContent = formatDate(p.created_at);
  $('infoAlbum').textContent = p.album_name || '未分类';
  $('modalCounter').textContent = `${currentIdx + 1} / ${photos.length}`;

  // Duration row
  const durRow = $('infoDurationRow');
  if (isVideo) {
    durRow.style.display = '';
    $('infoDuration').textContent = '加载中...';
    // Update duration when metadata loaded
    vid.onloadedmetadata = () => {
      if (vid.duration && isFinite(vid.duration)) {
        $('infoDuration').textContent = formatDuration(vid.duration);
        // Update width/height from video
        if (!p.width || !p.height) {
          $('infoRes').textContent = `${vid.videoWidth} × ${vid.videoHeight}`;
        }
      }
    };
  } else {
    durRow.style.display = 'none';
  }

  // Tags
  const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  $('modalTags').innerHTML = tags.length
    ? tags.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join('')
    : '';

  // IDs
  $('modalTitle').dataset.id = p.id;
  $('modalDesc').dataset.id = p.id;
  $('modalDownload').dataset.id = p.id;
  $('modalFavorite').dataset.id = p.id;

  // Download
  const dl = $('modalDownload');
  dl.href = getModalSrc(p);
  dl.download = p.original_name || p.filename;
  $('modalDownloadText').textContent = isVideo ? '下载视频' : '下载原图';

  // Play toggle button in sidebar
  const playToggle = $('modalPlayToggle');
  if (isVideo) {
    playToggle.style.display = '';
    updatePlayToggle();
  } else {
    playToggle.style.display = 'none';
  }

  // Favorite
  updateFavButton(p.id, faved);
}

function updatePlayToggle() {
  const vid = $('modalVideo');
  if (vid.paused) {
    $('playIcon').innerHTML = '<path d="M8 5v14l11-7z"/>';
    $('playText').textContent = '播放';
  } else {
    $('playIcon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    $('playText').textContent = '暂停';
  }
}

function updateFavButton(id, faved) {
  $('modalFavorite').dataset.id = id;
  $('favIcon').innerHTML = faved
    ? '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.7l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" fill="#ff4070" stroke="#ff4070"/>'
    : '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.7l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>';
  $('favText').textContent = faved ? '已收藏' : '收藏';
}

/* ── Init ──────────────────────────── */
let modalInited = false;
export function initModal() {
  if (modalInited) return;
  modalInited = true;

  $('modalClose').addEventListener('click', closeModal);
  $('modalBackdrop').addEventListener('click', closeModal);
  $('modalPrev').addEventListener('click', prev);
  $('modalNext').addEventListener('click', next);

  // Video control buttons
  $('modalPlayBtn').addEventListener('click', () => {
    const vid = $('modalVideo');
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
    updatePlayToggle();
  });

  $('modalVideo').addEventListener('play', updatePlayToggle);
  $('modalVideo').addEventListener('pause', updatePlayToggle);
  $('modalVideo').addEventListener('ended', () => { next(); });

  // Sidebar play toggle
  $('modalPlayToggle').addEventListener('click', () => {
    const vid = $('modalVideo');
    if (vid.paused) vid.play().catch(() => {});
    else vid.pause();
    updatePlayToggle();
  });

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!$('modal').classList.contains('open')) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'ArrowLeft') { prev(); return; }
    if (e.key === 'ArrowRight') { next(); return; }
    if (e.key === ' ') {
      e.preventDefault();
      const vid = $('modalVideo');
      if (vid.style.display !== 'none') {
        if (vid.paused) vid.play().catch(() => {});
        else vid.pause();
        updatePlayToggle();
      }
    }
  });

  // Download tracking
  $('modalDownload').addEventListener('click', async (e) => {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    if (isViewOnly()) {
      e.preventDefault();
      showLoginPrompt();
      return;
    }
    API.incrementDownload(Number(id)).catch(() => {});
    const photos = Store.getPhotos();
    const p = photos.find(ph => ph.id === Number(id));
    if (p) { p.download_count++; showContent(); }
  });

  // Favorite
  $('modalFavorite').addEventListener('click', () => {
    const id = $('modalFavorite').dataset.id;
    if (!id) return;
    if (isViewOnly()) {
      showLoginPrompt();
      return;
    }
    Store.toggleFavorite(id);
    const faved = Store.isFaved(id);
    updateFavButton(Number(id), faved);
    toast(faved ? '已添加到收藏' : '已取消收藏');
  });

  // Editable title
  const titleEl = $('modalTitle');
  let titleTimer;
  titleEl.addEventListener('input', () => {
    clearTimeout(titleTimer);
    const id = titleEl.dataset.id;
    titleTimer = setTimeout(() => {
      if (id) API.updatePhoto(Number(id), { title: titleEl.textContent }).catch(() => {});
    }, 600);
  });

  // Editable description
  const descEl = $('modalDesc');
  let descTimer;
  descEl.addEventListener('input', () => {
    clearTimeout(descTimer);
    const id = descEl.dataset.id;
    descTimer = setTimeout(() => {
      if (id) API.updatePhoto(Number(id), { description: descEl.textContent }).catch(() => {});
    }, 600);
  });

  // Subscribe to store
  Store.subscribe(() => {
    const photos = Store.getPhotos();
    if (currentIdx >= 0 && currentIdx < photos.length) {
      updateFavButton(photos[currentIdx].id, Store.isFaved(photos[currentIdx].id));
    }
  });
}
