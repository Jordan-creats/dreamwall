const state = {
  photos: [],
  albums: [],
  pagination: null,
  currentAlbum: 'all',
  currentSort: 'newest',
  currentSearch: '',
  currentTimeFilter: 'all',
  currentMediaType: 'all',
  currentPage: 1,
  theme: 'dark',
  favorites: new Set(),
  listeners: [],
  // Infinite scroll mode
  appendMode: false,
};

try {
  const favs = JSON.parse(localStorage.getItem('wp_favorites') || '[]');
  state.favorites = new Set(favs);
} catch { state.favorites = new Set(); }

function saveFavorites() {
  localStorage.setItem('wp_favorites', JSON.stringify([...state.favorites]));
}

export function subscribe(fn) {
  state.listeners.push(fn);
  return () => { state.listeners = state.listeners.filter(l => l !== fn); };
}

export function notify() { for (const fn of state.listeners) fn(state); }

// Getters
export function getPhotos()      { return state.photos; }
export function getAlbums()      { return state.albums; }
export function getPagination()  { return state.pagination; }
export function getCurrentAlbum() { return state.currentAlbum; }
export function getCurrentSort()  { return state.currentSort; }
export function getCurrentSearch() { return state.currentSearch; }
export function getCurrentTimeFilter() { return state.currentTimeFilter; }
export function getCurrentMediaType()  { return state.currentMediaType; }
export function getCurrentPage()  { return state.currentPage; }
export function getTheme()       { return state.theme; }
export function isFaved(id)      { return state.favorites.has(Number(id)); }
export function isAppendMode()   { return state.appendMode; }

// Setters
export function setPhotos(p, append = false) {
  if (append) {
    state.photos = [...state.photos, ...p];
  } else {
    state.photos = p;
  }
  state.appendMode = append;
  notify();
}
export function setAlbums(a)     { state.albums = a; notify(); }
export function setPagination(pg) { state.pagination = pg; notify(); }
export function setCurrentAlbum(a)  { state.currentAlbum = a; state.currentPage = 1; state.appendMode = false; notify(); }
export function setCurrentSort(s)   { state.currentSort = s; state.currentPage = 1; state.appendMode = false; notify(); }
export function setCurrentSearch(q) { state.currentSearch = q; state.currentPage = 1; state.appendMode = false; notify(); }
export function setCurrentTimeFilter(t) { state.currentTimeFilter = t; state.currentPage = 1; state.appendMode = false; notify(); }
export function setCurrentMediaType(m)  { state.currentMediaType = m; state.currentPage = 1; state.appendMode = false; notify(); }
export function setCurrentPage(p)  { state.currentPage = p; notify(); }
export function setTheme(t)     { state.theme = t; notify(); }

export function toggleFavorite(id) {
  const nid = Number(id);
  if (state.favorites.has(nid)) state.favorites.delete(nid);
  else state.favorites.add(nid);
  saveFavorites();
  notify();
}
