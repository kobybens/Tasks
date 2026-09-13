/* Small shared helpers for the browser. Dates are YYYY-MM-DD strings; all math is done in UTC
   so the local timezone never shifts a day. */

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const PALETTE = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

/** Today's date in the browser's local timezone as YYYY-MM-DD. */
export function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function weekday(iso) {
  return new Date(`${iso}T00:00:00Z`).getUTCDay();
}

/** Sunday on or before the given date. */
export function weekStartOf(iso) {
  return addDays(iso, -weekday(iso));
}

export function fmtDay(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function fmtRange(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${a.getUTCDate()}–${b.getUTCDate()} ${MONTHS[a.getUTCMonth()]} ${a.getUTCFullYear()}`
    : `${fmtDay(from)} – ${fmtDay(to)} ${b.getUTCFullYear()}`;
}

/** ISO timestamp -> "12 Sep, 21:40" in the viewer's local time (adds the year if not the current one). */
export function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const now = new Date();
  const year = d.getFullYear() === now.getFullYear() ? '' : ` ${d.getFullYear()}`;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${year}, ${hh}:${mm}`;
}

/** "2026-09-14T16:00" -> "16:00" */
export function fmtTime(dt) {
  return dt.slice(11, 16);
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/* ---------- Bottom sheet / modal ---------- */

const sheetRoot = document.getElementById('sheet-root');

/**
 * Open a sheet with the given inner HTML. Returns the sheet element.
 * `onClose` is called when it is dismissed by backdrop, Esc, or closeSheet().
 */
export function openSheet(html) {
  closeSheet();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeSheet();
  });
  sheetRoot.appendChild(backdrop);
  document.addEventListener('keydown', onEsc);
  const first = backdrop.querySelector('input, select, textarea, button');
  first?.focus();
  return backdrop.firstElementChild;
}

export function closeSheet() {
  sheetRoot.innerHTML = '';
  document.removeEventListener('keydown', onEsc);
}

function onEsc(e) {
  if (e.key === 'Escape') closeSheet();
}

export function userOptions(users, selectedId) {
  return users
    .map((u) => `<option value="${u.id}" ${Number(selectedId) === u.id ? 'selected' : ''}>${esc(u.display_name)}</option>`)
    .join('');
}

const EYE_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0 1 12 19c-7 0-11-7-11-7a20.3 20.3 0 0 1 5.1-5.9"/><path d="M9.9 4.2A10.9 10.9 0 0 1 12 5c7 0 11 7 11 7a20.4 20.4 0 0 1-3.3 4.2"/><path d="M14.1 14.1a3 3 0 1 1-4.2-4.2"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

/**
 * A password input with an eye button that reveals the text while pressed on.
 * Toggling is handled once, globally, by `bindPasswordEyes`.
 */
export function passwordField({ id, name, autocomplete, minlength, required = true }) {
  const attrs = [
    `id="${id}"`,
    `name="${name}"`,
    'type="password"',
    autocomplete ? `autocomplete="${autocomplete}"` : '',
    minlength ? `minlength="${minlength}"` : '',
    required ? 'required' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `<div class="pw-wrap"><input ${attrs} /><button type="button" class="pw-eye" data-eye="${id}" aria-label="Show password" aria-pressed="false" title="Show password">${EYE_ON}</button></div>`;
}

/** Delegated click handler: one listener per container covers every password field inside it. */
export function bindPasswordEyes(container) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-eye]');
    if (!btn) return;
    const input = document.getElementById(btn.dataset.eye);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    btn.title = show ? 'Hide password' : 'Show password';
    btn.innerHTML = show ? EYE_OFF : EYE_ON;
    input.focus({ preventScroll: true });
  });
}
