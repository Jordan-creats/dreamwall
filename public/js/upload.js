import * as API from './api.js';
import * as Store from './store.js';
import { toast } from './utils.js';
import { loadAndRender } from './gallery.js';

let pendingFiles = [];

export function initUpload() {
  const overlay = document.getElementById('uploadOverlay');
  const dropzone = document.getElementById('uploadDropzone');
  const fileInput = document.getElementById('fileInput');
  const btnUpload = document.getElementById('btnUpload');
  const uploadClose = document.getElementById('uploadClose');
  const uploadConfirm = document.getElementById('uploadConfirm');

  // Open drawer
  btnUpload.addEventListener('click', (e) => { e.stopPropagation(); openDrawer(); });

  // Close drawer
  uploadClose.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeDrawer(); });

  // File input trigger
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) { handleFiles(fileInput.files); fileInput.value = ''; }
  });

  // Drag & drop on dropzone
  ['dragenter', 'dragover'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); }));
  ['dragleave', 'drop'].forEach(ev =>
    dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('drag-over'); }));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  });

  // Global paste
  document.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.type.startsWith('image/')) files.push(item.getAsFile());
    }
    if (files.length) { handleFiles(files); openDrawer(); }
  });

  // Confirm upload
  uploadConfirm.addEventListener('click', () => doUpload());

  // Keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('searchInput').focus();
    }
  });
}

function openDrawer() {
  document.getElementById('uploadOverlay').classList.add('open');
  populateAlbumSelect();
}

function closeDrawer() {
  document.getElementById('uploadOverlay').classList.remove('open');
  pendingFiles = [];
  document.getElementById('uploadPreview').innerHTML = '';
  document.getElementById('uploadForm').style.display = 'none';
}

function handleFiles(files) {
  pendingFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
  if (!pendingFiles.length) { toast('请选择图片文件', { error: true }); return; }

  const preview = document.getElementById('uploadPreview');
  preview.innerHTML = pendingFiles.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);font-size:.82rem;">
      <span style="color:var(--accent);font-size:1.1rem;">🖼️</span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${f.name}</span>
      <span style="color:var(--text-muted);white-space:nowrap;">${(f.size/1024).toFixed(0)} KB</span>
    </div>
  `).join('');

  document.getElementById('uploadForm').style.display = '';
}

function populateAlbumSelect() {
  const sel = document.getElementById('uploadAlbum');
  const albums = Store.getAlbums();
  sel.innerHTML = '<option value="">选择分类（可选）</option>' +
    albums.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
}

async function doUpload() {
  if (!pendingFiles.length) return;
  const albumId = document.getElementById('uploadAlbum').value || null;

  let success = 0;
  for (const file of pendingFiles) {
    try {
      await API.uploadPhoto(file, albumId ? Number(albumId) : null);
      success++;
    } catch (err) {
      toast(`上传失败: ${err.message}`, { error: true });
    }
  }

  if (success > 0) {
    toast(`成功上传 ${success} 张壁纸`);
    await loadAndRender();
    // Reload albums to update counts
    try {
      const albums = await API.getAlbums();
      Store.setAlbums(albums);
    } catch {}
  }

  closeDrawer();
}
