// ui.js — tiny DOM + formatting helpers shared by every view. No app state here.

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function el(tag, attrs = {}, html = '') {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  if (html) node.innerHTML = html;
  return node;
}

export function pct(n) {
  return Number.isFinite(n) ? `${Math.round(n * 100)}%` : '—';
}

export function fmtMs(ms) {
  if (!Number.isFinite(ms)) return '—';
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function fmtBytes(n) {
  if (!Number.isFinite(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function timeAgo(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// Score bar with numeric label — color is never the only signal.
export function scoreBar(score, max = 1) {
  const v = Math.max(0, Math.min(1, (score || 0) / max));
  const w = Math.max(3, Math.round(v * 100));
  return `<span class="scorebar" role="img" aria-label="score ${Number(score || 0).toFixed(2)}"><span class="scorebar-fill" style="width:${w}%"></span></span>`;
}

// ---------- Toasts ----------
let toastRoot;
export function toast(message, { kind = 'info', timeout = 3600, actionLabel, onAction } = {}) {
  if (!toastRoot) toastRoot = document.getElementById('toast-root');
  const node = el('div', { class: `toast toast-${kind}`, role: 'status' });
  node.innerHTML = `<span>${escapeHtml(message)}</span>`;
  if (actionLabel && onAction) {
    const btn = el('button', { class: 'toast-action' }, escapeHtml(actionLabel));
    btn.addEventListener('click', () => { onAction(); dismiss(); });
    node.appendChild(btn);
  }
  toastRoot.appendChild(node);
  const dismiss = () => {
    node.classList.add('toast-out');
    setTimeout(() => node.remove(), 220);
  };
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}

// ---------- Modal ----------
// One modal at a time. openModal returns a close function; Escape and backdrop close it.
let activeModal = null;
export function openModal({ title, kicker, body, footer, wide = false, onClose }) {
  closeModal();
  const root = document.getElementById('modal-root');
  const backdrop = el('div', { class: 'modal-backdrop', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const box = el('div', { class: `modal ${wide ? 'modal-wide' : ''}` });
  box.innerHTML = `
    <div class="modal-head">
      <div>
        ${kicker ? `<div class="modal-kicker">${escapeHtml(kicker)}</div>` : ''}
        <div class="modal-title">${escapeHtml(title || '')}</div>
      </div>
      <button class="icon-btn modal-x" aria-label="Close dialog">✕</button>
    </div>
    <div class="modal-body"></div>
    ${footer ? '<div class="modal-foot"></div>' : ''}
  `;
  const bodyEl = box.querySelector('.modal-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  if (footer) {
    const footEl = box.querySelector('.modal-foot');
    if (typeof footer === 'string') footEl.innerHTML = footer; else footEl.appendChild(footer);
  }
  backdrop.appendChild(box);
  root.appendChild(backdrop);
  const close = () => {
    if (activeModal !== close) return;
    activeModal = null;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose?.();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) close(); });
  box.querySelector('.modal-x').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  activeModal = close;
  // Focus the first focusable control for keyboard users.
  setTimeout(() => box.querySelector('input, textarea, select, button:not(.modal-x)')?.focus(), 30);
  return { close, box };
}
export function closeModal() { activeModal?.(); }

export function download(filename, content, type = 'application/json') {
  const blob = new Blob([typeof content === 'string' ? content : JSON.stringify(content, null, 2)], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Animate the numeric part of an element's text from 0 to its value,
// preserving any prefix/suffix ("76%", "0.86", "<1ms"). No-op without a
// number or under prefers-reduced-motion.
export function countUp(el, duration = 750) {
  const text = el.textContent;
  const m = text.match(/-?\d+(\.\d+)?/);
  if (!m || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const target = parseFloat(m[0]);
  const decimals = m[1] ? m[1].length - 1 : 0;
  const prefix = text.slice(0, m.index);
  const suffix = text.slice(m.index + m[0].length);
  const t0 = performance.now();
  const frame = (now) => {
    const p = Math.min(1, (now - t0) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + (target * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = text;
  };
  requestAnimationFrame(frame);
}

// Sanitized markdown rendering (Marked + DOMPurify are global CDN scripts).
export function renderMarkdown(md) {
  const html = window.marked ? window.marked.parse(String(md ?? '')) : escapeHtml(md);
  return window.DOMPurify ? window.DOMPurify.sanitize(html) : html;
}
