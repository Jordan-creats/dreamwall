import * as API from './api.js';
import * as Store from './store.js';
import { render, loadPage } from './gallery.js';
import { initModal } from './modal.js';
import { initUpload } from './upload.js';
import { initToolbar, renderCategoryBar } from './toolbar.js';

/* ── Auth State ────────────────────── */
let currentUser = null;

function loadUser() {
  const token = localStorage.getItem('wp_token');
  const userStr = localStorage.getItem('wp_user');
  if (token && userStr) {
    try { currentUser = JSON.parse(userStr); } catch { currentUser = null; }
  }
  return currentUser;
}

function initAuthUI() {
  const user = loadUser();
  const userMenu = document.getElementById('userMenu');
  const loginLink = document.getElementById('loginLink');

  if (user) {
    userMenu.style.display = '';
    loginLink.style.display = 'none';
    document.getElementById('userAvatarText').textContent = user.username.charAt(0).toUpperCase();
    document.getElementById('dropdownUsername').textContent = user.username;
    if (user.role === 'admin') {
      document.getElementById('dropdownBadge').style.display = '';
      document.getElementById('adminLink').style.display = '';
    }

    // Dropdown toggle
    document.getElementById('userAvatarBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      userMenu.classList.toggle('open');
    });
    document.addEventListener('click', () => userMenu.classList.remove('open'));

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('wp_token');
      localStorage.removeItem('wp_user');
      window.location.reload();
    });

    // My favorites
    document.getElementById('myFavsLink').addEventListener('click', async (e) => {
      e.preventDefault();
      userMenu.classList.remove('open');
      if (!currentUser) return window.location.href = '/login.html';
      const token = localStorage.getItem('wp_token');
      if (!token) return;
      try {
        const res = await fetch('/api/auth/favorites', { headers: { 'Authorization': 'Bearer ' + token } });
        const data = await res.json();
        if (res.ok) {
          Store.setPhotos(data.photos);
          Store.setCurrentAlbum('favorites');
          document.querySelectorAll('#categoryInner .cat-chip').forEach(c => c.classList.remove('active'));
        }
      } catch {}
    });
  } else {
    userMenu.style.display = 'none';
    loginLink.style.display = '';
  }

  return user;
}

/* ── Upload auth header ────────────── */
export function getAuthHeaders() {
  const token = localStorage.getItem('wp_token');
  return token ? { 'Authorization': 'Bearer ' + token } : {};
}

export function getCurrentUser() { return currentUser; }

/* ── Theme ──────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('wp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  Store.setTheme(saved);

  document.getElementById('themeToggle').addEventListener('click', () => {
    const next = Store.getTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('wp_theme', next);
    Store.setTheme(next);
  });
}

/* ── Stats ──────────────────────────── */
function updateStats(albums, photos) {
  const totalPhotos = albums.reduce((s, a) => s + a.photo_count, 0);
  const totalVideos = photos.filter(p => p.media_type === 'video').length;
  const totalDownloads = photos.reduce((s, p) => s + (p.download_count || 0), 0);
  document.getElementById('statPhotos').textContent = totalPhotos;
  document.getElementById('statVideos').textContent = totalVideos;
  document.getElementById('statAlbums').textContent = albums.length;
  document.getElementById('statDownloads').textContent = totalDownloads;
}

/* ── Pagination render ─────────────── */
export function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!pagination || pagination.total_pages <= 1) {
    container.style.display = 'none';
    return;
  }
  container.style.display = '';
  const { page, total_pages } = pagination;
  let html = `<button class="page-btn" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= total_pages; i++) {
    if (i === 1 || i === total_pages || (i >= page - 2 && i <= page + 2)) {
      html += `<button class="page-btn${i === page ? ' active' : ''}" data-p="${i}">${i}</button>`;
    } else if (i === page - 3 || i === page + 3) {
      html += `<span style="color:var(--text-muted);padding:7px 3px">…</span>`;
    }
  }
  html += `<button class="page-btn" data-p="${page + 1}" ${page >= total_pages ? 'disabled' : ''}>›</button>`;
  container.innerHTML = html;

  container.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      loadPage(parseInt(btn.dataset.p));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ── Scroll ──────────────────────────── */
function initScrollEffect() {
  window.addEventListener('scroll', () => {
    const header = document.getElementById('header');
    header.style.boxShadow = window.scrollY > 50 ? '0 1px 0 var(--border), 0 4px 16px rgba(0,0,0,.3)' : '';
  }, { passive: true });
}

/* ── Bootstrap ──────────────────────── */
async function bootstrap() {
  initTheme();
  const user = initAuthUI();
  initModal();
  initUpload();
  initToolbar();
  initScrollEffect();

  // Subscribe to store to keep gallery in sync
  Store.subscribe((state) => {
    if (state.photos && state.photos.length !== undefined) {
      render(state.photos);
      updateStats(state.albums, state.photos);
    }
    if (state.pagination) renderPagination(state.pagination);
  });

  // Load albums
  try {
    const albums = await API.getAlbums();
    Store.setAlbums(albums);
    renderCategoryBar(albums);
  } catch (err) {
    console.error('Failed to load albums:', err);
  }

  // Load photos (page 1)
  await loadPage(1);
}

bootstrap();
