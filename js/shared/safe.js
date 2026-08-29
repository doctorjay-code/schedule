// Shared safe rendering helpers (HTML escaping & CSS color sanitization)
export function escapeHtml(value) {
  const node = document.createElement('span');
  node.textContent = String(value ?? '');
  return node.innerHTML;
}

export function safeCssColor(value, fallback = '#CBD5E1') {
  const color = String(value ?? '').trim();
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? color : fallback;
}
