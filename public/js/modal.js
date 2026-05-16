import * as API from './api.js';
import * as Store from './store.js';
import { formatDate, formatSize, formatDuration, toast, escapeHtml } from './utils.js';
import { isViewOnly, showLoginPrompt } from './upload.js';

let currentIdx = -1;

const $ = (id) => document.getElementById(id);
function safeOn(id, event, handler) {
  const el = $(id);
  if (el) el.addEventListener(event, handler);
}
function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text;
}

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

  // Reset sidebar to visible when opening
  const sidebar = document.querySelector('.modal-sidebar');
  const modalBody = document.querySelector('.modal-body');
  const toggleBtn = $('modalSidebarToggle');
  if (sidebar) sidebar.classList.remove('collapsed');
  if (modalBody) modalBody.classList.remove('sidebar-hidden');
  if (toggleBtn) toggleBtn.classList.remove('active');

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
    if (img) img.style.display = 'none';
    if (vid) {
      vid.style.display = '';
      const src = vid.querySelector('source');
      if (src) src.src = fullSrc;
      vid.load();
      vid.play().catch(() => {});
    }
    const vc = $('modalVideoControls');
    if (vc) vc.style.display = '';
  } else {
    if (vid) { vid.style.display = 'none'; vid.pause(); }
    if (img) { img.style.display = ''; img.src = fullSrc; }
    const vc = $('modalVideoControls');
    if (vc) vc.style.display = 'none';
  }

  // Badge
  const badge = $('modalBadge');
  if (badge) {
    if (isVideo) { badge.className = 'modal-badge video'; badge.textContent = '🎬 动态壁纸'; badge.style.display = ''; }
    else { badge.className = 'modal-badge image'; badge.textContent = '🖼️ 静态壁纸'; badge.style.display = ''; }
  }

  // Info
  setText('modalTitle', p.title || p.original_name);
  setText('modalDesc', p.description || '');
  setText('infoType', isVideo ? '动态壁纸' : '静态壁纸');
  setText('infoRes', `${p.width} × ${p.height}`);
  setText('infoSize', formatSize(p.file_size));
  setText('infoDownloads', String(p.download_count));
  setText('infoDate', formatDate(p.created_at));
  setText('infoAlbum', p.album_name || '未分类');
  setText('modalCounter', `${currentIdx + 1} / ${photos.length}`);

  // Duration row (optional)
  const durRow = $('infoDurationRow');
  if (durRow) {
    if (isVideo) {
      durRow.style.display = '';
      setText('infoDuration', '加载中...');
      if (vid) vid.onloadedmetadata = () => {
        if (vid.duration && isFinite(vid.duration)) {
          setText('infoDuration', formatDuration(vid.duration));
          if (!p.width || !p.height) {
            setText('infoRes', `${vid.videoWidth} × ${vid.videoHeight}`);
          }
        }
      };
    } else {
      durRow.style.display = 'none';
    }
  }

  // Tags
  const tags = (p.tags || '').split(',').map(t => t.trim()).filter(Boolean);
  const tagsEl = $('modalTags');
  if (tagsEl) tagsEl.innerHTML = tags.length
    ? tags.map(t => `<span class="modal-tag">${escapeHtml(t)}</span>`).join('')
    : '';

  // IDs
  const titleEl = $('modalTitle');
  const descEl = $('modalDesc');
  const dlEl = $('modalDownload');
  const favEl = $('modalFavorite');
  if (titleEl) titleEl.dataset.id = p.id;
  if (descEl) descEl.dataset.id = p.id;
  if (dlEl) dlEl.dataset.id = p.id;
  if (favEl) favEl.dataset.id = p.id;

  // Download
  if (dlEl) {
    dlEl.href = getModalSrc(p);
    dlEl.download = p.original_name || p.filename;
  }
  setText('modalDownloadText', isVideo ? '下载视频' : '下载原图');

  // Play toggle button in sidebar (optional)
  const playToggle = $('modalPlayToggle');
  if (playToggle) {
    if (isVideo) {
      playToggle.style.display = '';
      updatePlayToggle();
    } else {
      playToggle.style.display = 'none';
    }
  }

  // Favorite
  updateFavButton(p.id, faved);
}

function updatePlayToggle() {
  const vid = $('modalVideo');
  if (!vid) return;
  const playIcon = $('playIcon');
  const playText = $('playText');
  if (vid.paused) {
    if (playIcon) playIcon.innerHTML = '<path d="M8 5v14l11-7z"/>';
    if (playText) playText.textContent = '播放';
  } else {
    if (playIcon) playIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    if (playText) playText.textContent = '暂停';
  }
}

function updateFavButton(id, faved) {
  const favBtn = $('modalFavorite');
  const favIcon = $('favIcon');
  const favText = $('favText');
  if (favBtn) favBtn.dataset.id = id;
  if (favIcon) favIcon.innerHTML = faved
    ? '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.7l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z" fill="#ff4070" stroke="#ff4070"/>'
    : '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21.7l7.8-7.8 1.1-1.1a5.5 5.5 0 0 0 0-7.8Z"/>';
  if (favText) favText.textContent = faved ? '已收藏' : '收藏';
}

/* ── Init ──────────────────────────── */
let modalInited = false;
export function initModal() {
  if (modalInited) return;
  modalInited = true;

  safeOn('modalClose', 'click', closeModal);
  safeOn('modalBackdrop', 'click', closeModal);
  safeOn('modalPrev', 'click', prev);
  safeOn('modalNext', 'click', next);

  // Video control buttons (optional — only if present in DOM)
  safeOn('modalPlayBtn', 'click', () => {
    const vid = $('modalVideo');
    if (vid && vid.paused) vid.play().catch(() => {});
    else if (vid) vid.pause();
    updatePlayToggle();
  });

  const modalVideo = $('modalVideo');
  if (modalVideo) {
    modalVideo.addEventListener('play', updatePlayToggle);
    modalVideo.addEventListener('pause', updatePlayToggle);
    modalVideo.addEventListener('ended', () => { next(); });
  }

  // Sidebar play toggle (optional)
  safeOn('modalPlayToggle', 'click', () => {
    const vid = $('modalVideo');
    if (vid && vid.paused) vid.play().catch(() => {});
    else if (vid) vid.pause();
    updatePlayToggle();
  });

  // Sidebar collapse/expand toggle
  let sidebarVisible = true;
  const sidebarToggle = $('modalSidebarToggle');
  const sidebar = $('modal')?.querySelector('.modal-sidebar');
  const modalBody = $('modal')?.querySelector('.modal-body');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebarVisible = !sidebarVisible;
      sidebar.classList.toggle('collapsed', !sidebarVisible);
      modalBody?.classList.toggle('sidebar-hidden', !sidebarVisible);
      sidebarToggle.classList.toggle('active', !sidebarVisible);
    });
  }

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (!$('modal').classList.contains('open')) return;
    if (e.key === 'Escape') { closeModal(); return; }
    if (e.key === 'ArrowLeft') { prev(); return; }
    if (e.key === 'ArrowRight') { next(); return; }
    if (e.key === 'i' || e.key === 'I') {
      if (sidebarToggle && sidebar) {
        sidebarVisible = !sidebarVisible;
        sidebar.classList.toggle('collapsed', !sidebarVisible);
        modalBody?.classList.toggle('sidebar-hidden', !sidebarVisible);
        sidebarToggle.classList.toggle('active', !sidebarVisible);
      }
    }
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
