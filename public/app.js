import { renderWeek } from './views/week.js';
import { openTaskForm } from './views/taskForm.js';
import { openCarForm } from './views/carForm.js';
import { renderAdmin, bindAdmin } from './views/admin.js';
import { renderAccount, bindAccount } from './views/account.js';
import { addDays, todayIso, weekStartOf, fmtRange, esc } from './lib.js';

export const state = {
  user: null,
  users: [],
  weekStart: weekStartOf(todayIso()),
  occurrences: [],
  bookings: [],
  tab: 'week',
  loading: false,
};

const root = document.getElementById('app');

/* ---------------- API ---------------- */

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    state.user = null;
    render();
    throw new ApiError(401, data);
  }
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/* ---------------- Data loading ---------------- */

export async function loadUsers() {
  state.users = (await api('/api/users')).users;
}

export async function loadWeek() {
  const from = state.weekStart;
  const to = addDays(from, 6);
  state.loading = true;
  render();
  try {
    const [t, c] = await Promise.all([api(`/api/tasks?from=${from}&to=${to}`), api(`/api/car?from=${from}&to=${to}`)]);
    state.occurrences = t.occurrences;
    state.bookings = c.bookings;
  } finally {
    state.loading = false;
    render();
  }
}

/* ---------------- Toast ---------------- */

let toastTimer;
export function toast(msg, isError = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast${isError ? ' err' : ''}`;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 2600);
}

/* ---------------- Rendering ---------------- */

export function render() {
  if (!state.user) {
    root.innerHTML = renderLogin();
    return;
  }
  const tabs = [
    ['week', 'Week'],
    ['car', 'Car'],
    ...(state.user.is_admin ? [['admin', 'Admin']] : []),
    ['account', 'Account'],
  ];
  root.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">Family Tasks</div>
        <div class="who">
          <span class="dot" style="background:${esc(state.user.color)}"></span>
          <span>${esc(state.user.display_name)}</span>
          <button class="btn ghost" data-action="logout" style="min-height:36px">Log out</button>
        </div>
      </div>
      <nav class="tabs" role="tablist">
        ${tabs
          .map(
            ([id, label]) =>
              `<button class="tab" role="tab" data-action="tab" data-tab="${id}" aria-selected="${state.tab === id}">${label}</button>`,
          )
          .join('')}
      </nav>
    </header>
    <main class="main">${renderTab()}</main>`;
  if (state.tab === 'admin') bindAdmin(root);
  if (state.tab === 'account') bindAccount(root);
}

function renderTab() {
  switch (state.tab) {
    case 'week':
    case 'car':
      return `${renderWeekNav()}${state.loading && !state.occurrences.length ? '<div class="loading">Loading…</div>' : renderWeek(state, state.tab)}`;
    case 'admin':
      return renderAdmin(state);
    case 'account':
      return renderAccount(state);
    default:
      return '';
  }
}

function renderWeekNav() {
  const end = addDays(state.weekStart, 6);
  const isThisWeek = state.weekStart === weekStartOf(todayIso());
  return `
    <div class="weeknav">
      <button class="btn icon" data-action="prev" aria-label="Previous week">‹</button>
      <div class="title">${fmtRange(state.weekStart, end)}<small>${isThisWeek ? 'This week' : ''}&nbsp;</small></div>
      <button class="btn" data-action="today" ${isThisWeek ? 'disabled' : ''}>Today</button>
      <button class="btn icon" data-action="next" aria-label="Next week">›</button>
    </div>`;
}

function renderLogin() {
  return `
    <div class="login">
      <form id="login-form" autocomplete="on">
        <h1>Family Tasks</h1>
        <p class="sub">Sign in to see the week.</p>
        <div class="field"><label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus /></div>
        <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required /></div>
        <div class="error" id="login-error"></div>
        <button class="btn primary" type="submit">Log in</button>
      </form>
    </div>`;
}

/* ---------------- Events ---------------- */

root.addEventListener('submit', async (e) => {
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  const f = new FormData(e.target);
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
    state.user = user;
    await loadUsers();
    await loadWeek();
  } catch (ex) {
    err.textContent = ex.message;
  }
});

root.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const a = btn.dataset.action;
  try {
    switch (a) {
      case 'logout':
        await api('/api/auth/logout', { method: 'POST' });
        state.user = null;
        render();
        break;
      case 'tab':
        state.tab = btn.dataset.tab;
        if (state.tab === 'admin' || state.tab === 'account') await loadUsers();
        render();
        break;
      case 'prev':
        state.weekStart = addDays(state.weekStart, -7);
        await loadWeek();
        break;
      case 'next':
        state.weekStart = addDays(state.weekStart, 7);
        await loadWeek();
        break;
      case 'today':
        state.weekStart = weekStartOf(todayIso());
        await loadWeek();
        break;
      case 'add-task':
        openTaskForm({ date: btn.dataset.date });
        break;
      case 'edit-task': {
        const occ = state.occurrences.find((o) => o.task_id === Number(btn.dataset.task) && o.date === btn.dataset.date);
        if (occ) openTaskForm({ occurrence: occ });
        break;
      }
      case 'toggle-done': {
        const taskId = btn.dataset.task;
        const date = btn.dataset.date;
        const done = btn.getAttribute('aria-checked') === 'true';
        btn.setAttribute('aria-checked', String(!done));
        btn.closest('.row')?.classList.toggle('done', !done);
        await api(`/api/tasks/${taskId}/done/${date}`, { method: done ? 'DELETE' : 'PUT' });
        const occ = state.occurrences.find((o) => o.task_id === Number(taskId) && o.date === date);
        if (occ) occ.done = !done;
        break;
      }
      case 'add-car':
        openCarForm({ date: btn.dataset.date });
        break;
      case 'edit-car': {
        const b = state.bookings.find((x) => x.id === Number(btn.dataset.id));
        if (b) openCarForm({ booking: b });
        break;
      }
      default:
        break;
    }
  } catch (ex) {
    if (ex.status !== 401) toast(ex.message, true);
  }
});

/* ---------------- Boot ---------------- */

(async function boot() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
    await loadUsers();
    await loadWeek();
  } catch {
    render();
  }
})();
