import { api, state, loadUsers, render, toast, withPending } from '../app.js';
import { closeSheet, esc, openSheet, passwordField, PALETTE } from '../lib.js';

export function renderAdmin(state) {
  const usedColors = new Set(state.users.map((u) => u.color));
  const defaultColor = PALETTE.find((c) => !usedColors.has(c)) ?? PALETTE[0];
  return `
    <div class="card">
      <h2>Family members</h2>
      <div class="user-list">
        ${state.users
          .map(
            (u) => `
          <div class="user-row" data-id="${u.id}" style="--who:${esc(u.color)}">
            <span class="name">${esc(u.display_name)}</span>
            <span class="uname">@${esc(u.username)}</span>
            ${u.is_admin ? '<span class="badge">admin</span>' : ''}
            <span class="grow"></span>
            <span class="ops">
              <button class="btn" data-admin="reset" data-id="${u.id}">Reset password</button>
              <button class="btn" data-admin="color" data-id="${u.id}">Next color</button>
              ${u.id !== state.user.id ? `<button class="btn" data-admin="toggle-admin" data-id="${u.id}">${u.is_admin ? 'Remove admin' : 'Make admin'}</button>` : ''}
              ${u.id !== state.user.id ? `<button class="btn danger" data-admin="delete" data-id="${u.id}">Delete</button>` : ''}
            </span>
          </div>`,
          )
          .join('')}
      </div>
    </div>
    <div class="card">
      <h2>Add a family member</h2>
      <form class="form" id="add-user-form">
        <div class="two">
          <div class="field"><label for="au-name">Name</label><input id="au-name" name="display_name" required maxlength="40" placeholder="Noa" /></div>
          <div class="field"><label for="au-user">Username</label><input id="au-user" name="username" required pattern="[A-Za-z0-9_.\\-]{2,32}" placeholder="noa" autocomplete="off" /></div>
        </div>
        <div class="field"><label for="au-pw">Starting password <span class="hint">(at least 8 characters, they can change it later)</span></label>${passwordField({ id: 'au-pw', name: 'password', autocomplete: 'off', minlength: 8 })}</div>
        <div class="field"><label>Color</label>
          <div class="swatches">${PALETTE.map((c) => `<label style="background:${c}" title="${c}"><input type="radio" name="color" value="${c}" ${c === defaultColor ? 'checked' : ''} /></label>`).join('')}</div>
        </div>
        <label class="check-row"><input type="checkbox" name="is_admin" /> Can manage members (admin)</label>
        <div class="error" id="au-error"></div>
        <div class="actions"><button class="btn primary" type="submit" id="au-save">Add member</button></div>
      </form>
    </div>`;
}

export function bindAdmin(root) {
  const form = root.querySelector('#add-user-form');
  const err = root.querySelector('#au-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    try {
      await withPending(root.querySelector('#au-save'), 'Adding…', () =>
        api('/api/users', {
          method: 'POST',
          body: {
            display_name: f.get('display_name'),
            username: f.get('username'),
            password: f.get('password'),
            color: f.get('color'),
            is_admin: f.get('is_admin') === 'on',
          },
        }),
      );
      toast(`${f.get('display_name')} added`);
      await loadUsers();
      render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  root.querySelector('.user-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-admin]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const u = state.users.find((x) => x.id === id);
    if (!u) return;
    try {
      switch (btn.dataset.admin) {
        case 'reset':
          openResetSheet(u);
          return;
        case 'color': {
          const next = PALETTE[(PALETTE.indexOf(u.color) + 1) % PALETTE.length];
          await api(`/api/users/${id}`, { method: 'PATCH', body: { color: next } });
          if (id === state.user.id) state.user.color = next;
          break;
        }
        case 'toggle-admin':
          await api(`/api/users/${id}`, { method: 'PATCH', body: { is_admin: !u.is_admin } });
          break;
        case 'delete':
          if (!confirm(`Delete ${u.display_name}? Their tasks and car bookings will be removed too.`)) return;
          await api(`/api/users/${id}`, { method: 'DELETE' });
          toast(`${u.display_name} deleted`);
          break;
        default:
          return;
      }
      await loadUsers();
      render();
    } catch (ex) {
      toast(ex.message, true);
    }
  });
}

function openResetSheet(u) {
  const sheet = openSheet(`
    <h2>Reset password for ${esc(u.display_name)}</h2>
    <form class="form" id="reset-form">
      <div class="field"><label for="rp-pw">New password <span class="hint">(at least 8 characters)</span></label>${passwordField({ id: 'rp-pw', name: 'password', autocomplete: 'off', minlength: 8 })}</div>
      <p class="hint">Tell ${esc(u.display_name)} the new password. They can change it from their Account tab.</p>
      <div class="error" id="rp-error"></div>
      <div class="actions">
        <span class="spacer"></span>
        <button type="button" class="btn" id="rp-cancel">Cancel</button>
        <button type="submit" class="btn primary" id="rp-save">Set password</button>
      </div>
    </form>`);
  const form = sheet.querySelector('#reset-form');
  const err = sheet.querySelector('#rp-error');
  sheet.querySelector('#rp-cancel').addEventListener('click', closeSheet);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await withPending(sheet.querySelector('#rp-save'), 'Saving…', () =>
        api(`/api/users/${u.id}`, { method: 'PATCH', body: { password: new FormData(form).get('password') } }),
      );
      closeSheet();
      toast(`Password for ${u.display_name} was reset`);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}
