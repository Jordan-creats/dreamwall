import * as API from './api.js';
import * as Store from './store.js';
import { escapeHtml, formatDate } from './utils.js';
import { openModal } from './modal.js';

let hoverTimer = null;
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    const video = entry.target;
    if (entry.isIntersecting && video.dataset.src && !video.src) {
      video.src = video.dataset.src;
      video.removeAttribute('data-src');
    }
  }
}, { rootMargin: '200px' });

export async function loadPage(page) {
  try {
    const data = await API.getPhotos({
      album: Store.getCurrentAlbum(),
      search: Store.getCurrentSearch(),
      sort: Store.getCurrentSort(),
      time: Store.getCurrentTimeFilter(),
      type: Store.getCurrentMediaType(),
      page: page || Store.getCurrentPage(),
    });
    Store.setPhotos(data.photos);
    Store.setPagination({ page: data.page, total_pages: data.total_pages, total: data.total, per_page: data.per_page });
    Store.setCurrentPage(data.page);
  } catch (err) {
    console.error('Failed to load photos:', err);
  }
}

export async function loadAndRender() {
  await loadPage(1);
}

export function render(photos) {
  const gallery = document.getElementById('gallery');
  const emptyState = document.getElementById('emptyState');
  const toolbar = document.getElementById('toolbar');

  if (!photos || !photos.length) {
    gallery.innerHTML = '';
    emptyState.style.display = '';
    toolbar.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';
  toolbar.style.display = '';

  gallery.innerHTML = photos.map((p, idx) => {
    const isFaved = Store.isFaved(p.id);
    const isVideo = p.media_type === 'video';
    const delay = (idx % 20) * 0.03;
    const thumbSrc = p.thumbnail ? `/uploads/thumbs/${p.thumbnail}` : '';

    return `
      <div class="card" data-idx="${idx}" data-id="${p.id}" data-media="${p.media_type}" style="animation-delay:${delay}s">
        <div class="card-img-wrap">
          ${isVideo ? `
            ${thumbSrc ? `<div class="card-video-thumb"><img src="${thumbSrc}" alt="" /></div>` : ''}
            <span class="card-video-badge">▶ 动态</span>
            <video muted loop playsinline preload="none" poster="${thumbSrc}"
              ${thumbSrc ? '' : `data-src="/uploads/${p.filename}"`}
              ${thumbSrc ? `src="/uploads/${p.filename}"` : ''}
              disableRemotePlayback>
            </video>
          ` : `
            <img src="/uploads/${p.filename}" alt="${escapeHtml(p.title || p.original_name)}" loading="lazy" />
          `}
          <div class="card-overlay">
            <span class="card-res">${isVideo ? '🎬' : (p.width ? `${p.width}×${p.height}` : '')}</span>
            <button class="card-fav-btn${isFaved ? ' faved' : ''}" data-action="fav" data-id="${p.id}" title="${isFaved ? '取消收藏' : '收藏'}">
              ${isFaved ? '♥' : '♡'}
            </button>
          </div>
        </div>
        <div class="card-body">
          <div class="card-title">${escapeHtml(p.title || p.original_name)}</div>
          <div class="card-meta">
            <span>${isVideo ? '🎬 动态' : '⬇ ' + (p.download_count || 0)}</span>
            <span>${formatDate(p.created_at)}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire events
  gallery.querySelectorAll('.card').forEach(card => {
    const video = card.querySelector('video');
    if (video) {
      observer.observe(video);
      card.addEventListener('mouseenter', () => {
        hoverTimer = setTimeout(() => { video.play().catch(() => {}); card.classList.add('playing'); }, 200);
      });
      card.addEventListener('mouseleave', () => { clearTimeout(hoverTimer); video.pause(); card.classList.remove('playing'); });
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="fav"]')) {
        e.stopPropagation();
        const btn = e.target.closest('[data-action="fav"]');
        const id = btn.dataset.id;
        Store.toggleFavorite(id);
        const isFaved = Store.isFaved(id);
        btn.classList.toggle('faved', isFaved);
        btn.innerHTML = isFaved ? '♥' : '♡';
        btn.title = isFaved ? '取消收藏' : '收藏';
        return;
      }
      const idx = parseInt(card.dataset.idx);
      if (!isNaN(idx)) openModal(idx);
    });
  });
}
