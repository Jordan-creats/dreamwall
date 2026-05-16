import * as API from './api.js';
import * as Store from './store.js';
import { render, loadPage } from './gallery.js';
import { initModal } from './modal.js';
import { initUpload, clearViewOnly } from './upload.js';
import { initToolbar, renderCategoryBar } from './toolbar.js';
import { initParticles, initMouseGlow, initBanners, initFeatured, initTrendingTags, showSkeleton, hideSkeleton } from './effects.js';

/* ── Global error logger ──────────── */
window.onerror = (msg, src, line) => {
  console.error('[JS Error]', msg, 'at', src, 'line', line);
  const el = document.getElementById('emptyState');
  if (el && !document.getElementById('gallery').innerHTML) {
    el.style.display = '';
    el.querySelector('h3').textContent = '页面加载出错';
    el.querySelector('p').textContent = '请刷新页面重试，或检查浏览器控制台';
  }
};

/* ── Auth ──────────────────────────── */
let currentUser = null;

async function loadUser() {
  try {
    const headers = {};
    const token = localStorage.getItem('wp_token');
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const res = await fetch('/api/auth/me', { headers });
    if (res.ok) {
      currentUser = await res.json();
      localStorage.setItem('wp_user', JSON.stringify(currentUser));
      clearViewOnly();
      return currentUser;
    }
  } catch {}
  try { currentUser = JSON.parse(localStorage.getItem('wp_user')); } catch { currentUser = null; }
  return currentUser;
}

async function initAuthUI() {
  const user = await loadUser();
  const userMenu = document.getElementById('userMenu');
  const loginLink = document.getElementById('loginLink');
  if (!userMenu || !loginLink) return;

  if (user) {
    userMenu.style.display = '';
    loginLink.style.display = 'none';
    const avatarText = document.getElementById('userAvatarText');
    const dropdownUsername = document.getElementById('dropdownUsername');
    if (avatarText) avatarText.textContent = user.username.charAt(0).toUpperCase();
    if (dropdownUsername) dropdownUsername.textContent = user.username;

    if (user.role === 'admin') {
      const badge = document.getElementById('dropdownBadge');
      const adminLink = document.getElementById('adminLink');
      if (badge) badge.style.display = '';
      if (adminLink) adminLink.style.display = '';
    }

    const avatarBtn = document.getElementById('userAvatarBtn');
    if (avatarBtn) avatarBtn.addEventListener('click', (e) => { e.stopPropagation(); userMenu.classList.toggle('open'); });
    document.addEventListener('click', () => userMenu.classList.remove('open'));

    const favLink = document.getElementById('myFavsLink');
    if (favLink) {
      favLink.textContent = '👤 个人主页';
      favLink.addEventListener('click', (e) => { e.preventDefault(); window.location.href = `/profile.html?u=${encodeURIComponent(user.username)}`; });
    }

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
        localStorage.removeItem('wp_token'); localStorage.removeItem('wp_user');
        window.location.reload();
      });
    }
  } else {
    userMenu.style.display = 'none'; loginLink.style.display = '';
  }
  return user;
}

export function getCurrentUser() { return currentUser; }

/* ── Theme ──────────────────────────── */
function initTheme() {
  const saved = localStorage.getItem('wp_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  Store.setTheme(saved);
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const next = Store.getTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('wp_theme', next);
    Store.setTheme(next);
    // 视觉反馈
    btn.style.transform = 'scale(1.15)';
    setTimeout(() => btn.style.transform = '', 200);
  });
}

/* ── Stats ──────────────────────────── */
function updateStats(albums) {
  const ids = ['statPhotos', 'statVideos', 'statAlbums', 'statDownloads'];
  const els = ids.map(id => document.getElementById(id));
  if (!els[0]) return;
  els[0].textContent = albums.reduce((s, a) => s + a.photo_count, 0);
  els[1].textContent = '—';
  els[2].textContent = albums.length;
  els[3].textContent = '—';
}

/* ── Hero Search ───────────────────── */
function initHeroSearch() {
  const heroInput = document.getElementById('heroSearchInput');
  const heroBtn = document.getElementById('heroSearchBtn');
  const navInput = document.getElementById('searchInput');
  if (!heroInput || !navInput) return;

  function doSearch() {
    const q = heroInput.value.trim();
    if (!q) return;
    navInput.value = q;
    Store.setCurrentSearch(q);
    import('./gallery.js').then(m => m.loadAndRender());
    // 视觉反馈
    if (heroBtn) { heroBtn.textContent = '搜索中...'; setTimeout(() => heroBtn.textContent = '搜索', 600); }
  }
  if (heroBtn) heroBtn.addEventListener('click', doSearch);
  heroInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
}

/* ── Header shrink ─────────────────── */
function initHeaderShrink() {
  const header = document.getElementById('header');
  const catBar = document.getElementById('categoryBar');
  if (!header) return;
  window.addEventListener('scroll', () => {
    const scrolled = window.scrollY > 40;
    header.classList.toggle('scrolled', scrolled);
    if (catBar) catBar.classList.toggle('scrolled', scrolled);
  }, { passive: true });
}

/* ── Bootstrap ──────────────────────── */
async function bootstrap() {
  // ★ 同步初始化（不需要等 API）
  initTheme();
  initModal();
  initUpload();
  initToolbar();
  initParticles();
  initMouseGlow();
  initHeaderShrink();
  initHeroSearch();
  showSkeleton();

  // ★ 异步并行：数据加载
  try {
    const albums = await API.getAlbums();
    Store.setAlbums(albums);
    renderCategoryBar(albums);
    updateStats(albums);
  } catch (err) { console.error('Albums failed:', err); }

  // 初始化用户 UI、Banner、推荐
  initAuthUI().catch(() => {});
  initBanners();
  initFeatured();
  initTrendingTags();

  // Store 订阅：数据就绪 → 渲染画廊
  Store.subscribe((state) => {
    if (state.photos && state.photos.length !== undefined) {
      hideSkeleton();
      render(state.photos, state.appendMode);
      updateStats(state.albums);
    }
  });

  // 加载首页图片
  await loadPage(1, false);
}

bootstrap().catch(err => {
  console.error('Bootstrap failed:', err);
  const el = document.getElementById('emptyState');
  if (el) { el.style.display = ''; el.querySelector('h3').textContent = '加载失败'; el.querySelector('p').textContent = err.message; }
  document.getElementById('skeletonGrid').style.display = 'none';
});
