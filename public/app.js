import { renderWeek } from './views/week.js';
import { openTaskForm } from './views/taskForm.js';
import { openCarForm } from './views/carForm.js';
import { renderAdmin, bindAdmin } from './views/admin.js';
import { renderAccount, bindAccount } from './views/account.js';
import { renderShopping, bindShopping } from './views/shopping.js';
import { renderNotes, bindNotes } from './views/notes.js';
import { addDays, todayIso, weekStartOf, fmtRange, esc, passwordField, bindPasswordEyes } from './lib.js';

export const state = {
  user: null,
  users: [],
  weekStart: weekStartOf(todayIso()),
  occurrences: [],
  bookings: [],
  shopping: [],
  shoppingGroups: [],
  notes: [],
  tab: 'week',
  loading: false,
  focusToday: true,
};

const root = document.getElementById('app');
bindPasswordEyes(root);
bindPasswordEyes(document.getElementById('sheet-root'));

/* ---------------- API ---------------- */

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `HTTP ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, { error: 'No connection. Check your internet and try again.' });
  }
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/api/auth/login')) {
    state.user = null;
    render();
    throw new ApiError(401, data);
  }
  if (res.status >= 500) throw new ApiError(res.status, { error: 'Something went wrong on the server. Please try again.' });
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
    scrollToTodayIfNeeded();
  }
}

export async function loadShopping() {
  state.loading = true;
  render();
  try {
    const data = await api('/api/shopping');
    state.shopping = data.items;
    state.shoppingGroups = data.groups;
  } finally {
    state.loading = false;
    render();
  }
}

export async function loadNotes() {
  state.loading = true;
  render();
  try {
    state.notes = (await api('/api/notes')).notes;
  } finally {
    state.loading = false;
    render();
  }
}

/** On phones the week is a long list; bring today into view once after a fresh load. */
function scrollToTodayIfNeeded() {
  if (!state.focusToday) return;
  state.focusToday = false;
  if (window.innerWidth >= 700) return;
  const el = root.querySelector('.day.today');
  if (el && el.getBoundingClientRect().top > window.innerHeight * 0.6) {
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
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
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 5000 : 2600);
}

/**
 * Disable a submit button while an async action runs, restoring it afterwards.
 * The returned promise resolves to the action's result or rejects with its error.
 */
export async function withPending(button, pendingLabel, action) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = pendingLabel;
  try {
    return await action();
  } finally {
    if (button.isConnected) {
      button.disabled = false;
      button.textContent = label;
    }
  }
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
    ['shopping', 'Super'],
    ['notes', 'Notes'],
    ...(state.user.is_admin ? [['admin', 'Admin']] : []),
    ['account', 'Account'],
  ];
  root.innerHTML = `
    <header class="topbar">
      <div class="topbar-inner">
        <div class="brand">The Ben-Shloosh Family</div>
        <div class="who">
          <span class="dot" style="background:${esc(state.user.color)}"></span>
          <span class="name">${esc(state.user.display_name)}</span>
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
  if (state.tab === 'shopping') bindShopping(root);
  if (state.tab === 'notes') bindNotes(root);
}

function renderTab() {
  switch (state.tab) {
    case 'week':
    case 'car':
      return `${renderWeekNav()}${renderWeek(state, state.tab)}`;
    case 'admin':
      return renderAdmin(state);
    case 'account':
      return renderAccount(state);
    case 'shopping':
      return renderShopping(state);
    case 'notes':
      return renderNotes(state);
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
        <h1>The Ben-Shloosh Family</h1>
        <p class="sub">Sign in to see the week.</p>
        <div class="field"><label for="u">Username</label><input id="u" name="username" autocomplete="username" required autofocus /></div>
        <div class="field"><label for="p">Password</label>${passwordField({ id: 'p', name: 'password', autocomplete: 'current-password' })}</div>
        <div class="error" id="login-error"></div>
        <button class="btn primary" type="submit">Sign in</button>
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
    await withPending(e.target.querySelector('button[type=submit]'), 'Signing in…', async () => {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
      state.user = user;
      state.focusToday = true;
      await loadUsers();
      await loadWeek();
    });
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
        state.tab = 'week';
        render();
        break;
      case 'tab':
        state.tab = btn.dataset.tab;
        if (state.tab === 'admin' || state.tab === 'account') await loadUsers();
        if (state.tab === 'shopping') await loadShopping();
        else if (state.tab === 'notes') await loadNotes();
        else render();
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
        state.focusToday = true;
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
        const wasDone = btn.getAttribute('aria-checked') === 'true';
        const row = btn.closest('.row');
        const apply = (done) => {
          btn.setAttribute('aria-checked', String(done));
          btn.textContent = done ? '✓' : '';
          row?.classList.toggle('done', done);
        };
        apply(!wasDone);
        try {
          await api(`/api/tasks/${taskId}/done/${date}`, { method: wasDone ? 'DELETE' : 'PUT' });
          const occ = state.occurrences.find((o) => o.task_id === Number(taskId) && o.date === date);
          if (occ) occ.done = !wasDone;
        } catch (ex) {
          apply(wasDone);
          throw ex;
        }
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
