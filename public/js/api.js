const BASE = '/api';

async function request(url, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(url, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data;
}

export async function getAlbums() {
  return request(`${BASE}/albums`);
}

export async function getPhotos({ album, search, sort, time, type, page, per_page } = {}) {
  const params = new URLSearchParams();
  if (album && album !== 'all') params.set('album', album);
  if (search) params.set('search', search);
  if (sort && sort !== 'newest') params.set('sort', sort);
  if (time && time !== 'all') params.set('time', time);
  if (type && type !== 'all') params.set('type', type);
  if (page && page > 1) params.set('page', page);
  params.set('per_page', per_page || '16'); // ★ 每页 16 张，减少首次加载
  const qs = params.toString();
  return request(`${BASE}/photos${qs ? '?' + qs : ''}`);
}

export async function getPhoto(id) {
  return request(`${BASE}/photos/${id}`);
}

export async function uploadPhoto(file, albumId = null) {
  const form = new FormData();
  form.append('photo', file);
  if (albumId) form.append('album_id', albumId);
  const user = JSON.parse(localStorage.getItem('wp_user') || '{}');
  if (user.id) form.append('uploader_id', user.id);
  return request(`${BASE}/photos/upload`, { method: 'POST', body: form });
}

export async function updatePhoto(id, data) {
  return request(`${BASE}/photos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export async function deletePhoto(id) {
  return request(`${BASE}/photos/${id}`, { method: 'DELETE' });
}

export async function incrementDownload(id) {
  return request(`${BASE}/photos/${id}/download`, { method: 'POST' });
}
