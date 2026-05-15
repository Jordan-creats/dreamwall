import * as Store from './store.js';
import { debounce } from './utils.js';
import { loadAndRender } from './gallery.js';

let toolbarInited = false;

export function initToolbar() {
  if (toolbarInited) return;
  toolbarInited = true;

  // ── Category bar ───────────────────
  document.getElementById('categoryInner').addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-chip');
    if (!chip) return;
    const slug = chip.dataset.slug;
    Store.setCurrentAlbum(slug);
    document.querySelectorAll('#categoryInner .cat-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadAndRender();
  });

  // ── Media type filter ──────────────
  document.getElementById('typeGroup').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-type]');
    if (!chip) return;
    const type = chip.dataset.type;
    Store.setCurrentMediaType(type);
    document.querySelectorAll('#typeGroup [data-type]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadAndRender();
  });

  // ── Sort chips ─────────────────────
  document.getElementById('sortGroup').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-sort]');
    if (!chip) return;
    const sort = chip.dataset.sort;
    Store.setCurrentSort(sort);
    document.querySelectorAll('#sortGroup [data-sort]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadAndRender();
  });

  // ── Time filter chips ──────────────
  const toolbarRight = document.querySelector('.toolbar-right');
  if (toolbarRight) toolbarRight.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-time]');
    if (!chip) return;
    const time = chip.dataset.time;
    Store.setCurrentTimeFilter(time);
    document.querySelectorAll('.toolbar-right [data-time]').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    loadAndRender();
  });

  // ── Search ─────────────────────────
  const searchInput = document.getElementById('searchInput');
  const debouncedSearch = debounce(() => {
    Store.setCurrentSearch(searchInput.value.trim());
    loadAndRender();
  }, 350);
  searchInput.addEventListener('input', debouncedSearch);
}

export function renderCategoryBar(albums) {
  const catInner = document.getElementById('categoryInner');
  const total = albums.reduce((s, a) => s + a.photo_count, 0);
  let html = `<button class="cat-chip active" data-slug="all">🔥 全部<span class="cat-count">${total}</span></button>`;

  const icons = { anime: '🌸', scenery: '🏔️', girl: '💃', tech: '🚀', game: '🎮', pet: '🐾', live: '🎬', abstract: '🎨' };
  for (const a of albums) {
    const icon = icons[a.slug] || '📁';
    html += `<button class="cat-chip" data-slug="${a.slug}">${icon} ${a.name}<span class="cat-count">${a.photo_count}</span></button>`;
  }

  catInner.innerHTML = html;
}
