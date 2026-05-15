import * as API from './api.js';
import * as Store from './store.js';
import { escapeHtml, formatDate } from './utils.js';
import { openModal } from './modal.js';

let hoverTimer = null;
let loading = false;

// ═══════════════════════════════════════
// URL 智能优化 — 卡片小图 / 弹窗大图
// ═══════════════════════════════════════

// 卡片缩略图 — 固定 600px 宽
function getCardSrc(p) {
  const url = p.url || `/uploads/${p.filename}`;
  if (p.thumbnail && p.thumbnail.startsWith('http')) return p.thumbnail;
  if (p.thumbnail) return `/uploads/thumbs/${p.thumbnail}`;
  // Picsum: /seed/wp1/2560/1440 → /seed/wp1/600/400
  if (url.includes('picsum.photos')) {
    return url.replace(/\/\d+\/\d+$/, '/600/400');
  }
  // Cloudinary: add w_600 transform
  if (url.includes('cloudinary.com') && url.includes('/upload/')) {
    return url.replace('/upload/', '/upload/w_600,c_scale,q_auto,f_auto/');
  }
  return url;
}

// 弹窗/详情大图 — 保持原分辨率
function getFullSrc(p) {
  return p.url || `/uploads/${p.filename}`;
}

// 查看用的完整链接
function getDetailUrl(p) {
  return `/wallpaper.html?id=${p.id}`;
}

// ═══════════════════════════════════════
// 视频懒加载
// ═══════════════════════════════════════
const videoObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const video = entry.target;
    if (entry.isIntersecting) {
      if (video.dataset.src && !video.src) {
        video.src = video.dataset.src;
        video.removeAttribute('data-src');
      }
      videoObserver.unobserve(video);
    }
  }
}, { rootMargin: '300px' });

// ═══════════════════════════════════════
// Infinite scroll sentinel
// ═══════════════════════════════════════
let sentinelEl = null;
const scrollObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !loading) {
    const pg = Store.getPagination();
    if (pg && pg.page < pg.total_pages) loadNextPage();
  }
}, { rootMargin: '500px' });

function createSentinel() {
  if (sentinelEl) sentinelEl.remove();
  sentinelEl = document.createElement('div');
  sentinelEl.className = 'scroll-sentinel';
  sentinelEl.innerHTML = '<div class="sentinel-spinner"></div>';
  document.getElementById('gallery').after(sentinelEl);
  scrollObserver.observe(sentinelEl);
}

function updateSentinel() {
  const pg = Store.getPagination();
  if (!sentinelEl) createSentinel();
  if (pg && pg.page >= pg.total_pages) {
    sentinelEl.innerHTML = pg.total > 0 ? '<p class="sentinel-end">— 已经到底了 —</p>' : '';
    scrollObserver.unobserve(sentinelEl);
  } else {
    sentinelEl.innerHTML = '<div class="sentinel-spinner"></div>';
  }
}

// ═══════════════════════════════════════
// Page loading
// ═══════════════════════════════════════
export async function loadPage(page, append = false) {
  if (loading) return;
  loading = true;
  try {
    const data = await API.getPhotos({
      album: Store.getCurrentAlbum(),
      search: Store.getCurrentSearch(),
      sort: Store.getCurrentSort(),
      time: Store.getCurrentTimeFilter(),
      type: Store.getCurrentMediaType(),
      page: page || Store.getCurrentPage(),
      per_page: 16, // ★ 减少单页加载量
    });
    Store.setPhotos(data.photos, append);
    Store.setPagination({ page: data.page, total_pages: data.total_pages, total: data.total, per_page: data.per_page });
    Store.setCurrentPage(data.page);
  } catch (err) {
    console.error('Failed to load:', err);
  } finally {
    loading = false;
    updateSentinel();
  }
}

async function loadNextPage() {
  const pg = Store.getPagination();
  if (!pg || pg.page >= pg.total_pages) return;
  await loadPage(pg.page + 1, true);
}

export async function loadAndRender() {
  await loadPage(1, false);
}

// ═══════════════════════════════════════
// Card HTML
// ═══════════════════════════════════════
function cardHTML(p, idx) {
  const isFaved = Store.isFaved(p.id);
  const isVideo = p.media_type === 'video';
  const thumbSrc = getCardSrc(p);
  const fullSrc = getFullSrc(p);
  const delay = (idx % 16) * 0.02;

  return `
    <div class="card" data-idx="${idx}" data-id="${p.id}" data-media="${p.media_type}"
         data-full="${fullSrc}" style="animation-delay:${delay}s">
      <a href="${getDetailUrl(p)}" class="card-link"></a>
      <div class="card-img-wrap">
        ${isVideo ? `
          <span class="card-video-badge"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg> 动态</span>
          <video muted loop playsinline preload="none" poster="${thumbSrc}"
            data-src="${fullSrc}" disableRemotePlayback></video>
        ` : `
          <img src="${thumbSrc}"
               alt="${escapeHtml(p.title || p.original_name)}"
               loading="lazy" decoding="async"
               onload="this.classList.add('loaded')"
               style="background:var(--bg-elevated)" />
        `}
        <div class="card-overlay">
          <span class="card-res">${isVideo ? '🎬 动态' : (p.width ? `${p.width}×${p.height}` : '')}</span>
          <button class="card-fav-btn${isFaved ? ' faved' : ''}" data-action="fav" data-id="${p.id}" title="${isFaved ? '取消收藏' : '收藏'}">
            ${isFaved ? '♥' : '♡'}
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="card-title">${escapeHtml(p.title || p.original_name)}</div>
        <div class="card-meta">
          <span>⬇ ${p.download_count || 0}</span>
          <span>${formatDate(p.created_at)}</span>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════
// Render
// ═══════════════════════════════════════
export function render(photos, append = false) {
  const gallery = document.getElementById('gallery');
  const emptyState = document.getElementById('emptyState');
  const toolbar = document.getElementById('toolbar');

  if (!photos || !photos.length) {
    if (!append) {
      gallery.innerHTML = '';
      emptyState.style.display = '';
      toolbar.style.display = 'none';
      if (sentinelEl) sentinelEl.style.display = 'none';
    }
    return;
  }

  emptyState.style.display = 'none';
  toolbar.style.display = '';
  if (sentinelEl) sentinelEl.style.display = '';

  if (append) {
    const startIdx = Store.getPhotos().length - photos.length;
    gallery.insertAdjacentHTML('beforeend', photos.map((p, i) => cardHTML(p, startIdx + i)).join(''));
  } else {
    gallery.innerHTML = photos.map((p, i) => cardHTML(p, i)).join('');
    createSentinel();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // ★ Wire: Observe all new images for lazy loading
  const newCards = append
    ? gallery.querySelectorAll(`.card:nth-child(n+${Store.getPhotos().length - photos.length + 1})`)
    : gallery.querySelectorAll('.card');

  newCards.forEach(card => {
    const video = card.querySelector('video');
    if (video) {
      videoObserver.observe(video);
      card.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => { video.play().catch(() => {}); card.classList.add('playing'); }, 200);
      });
      card.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); video.pause(); card.classList.remove('playing'); });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="fav"]')) {
        e.stopPropagation(); e.preventDefault();
        const btn = e.target.closest('[data-action="fav"]');
        const id = btn.dataset.id;
        Store.toggleFavorite(id);
        const isFaved = Store.isFaved(id);
        btn.classList.toggle('faved', isFaved);
        btn.innerHTML = isFaved ? '♥' : '♡';
        btn.title = isFaved ? '取消收藏' : '收藏';
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      const idx = parseInt(card.dataset.idx);
      if (!isNaN(idx)) openModal(idx, card.dataset.full);
    });
  });
}
