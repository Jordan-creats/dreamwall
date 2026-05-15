// Shared utilities for non-module HTML pages
function getSrc(p) { return p.url || `/uploads/${p.filename}`; }

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
