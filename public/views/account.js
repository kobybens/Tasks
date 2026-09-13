import { api, state, loadUsers, render, toast, withPending } from '../app.js';
import { avatarHtml, esc, passwordField } from '../lib.js';

const AVATAR_SIZE = 192;

export function renderAccount(state) {
  const u = state.user;
  return `
    <div class="card">
      <div class="profile">
        ${avatarHtml(u, 96, 'profile-avatar')}
        <div class="profile-text">
          <form class="name-form" id="name-form" autocomplete="off">
            <input name="display_name" maxlength="40" required value="${esc(u.display_name)}" aria-label="Your name" />
            <button class="btn" type="submit" id="name-save">Save</button>
          </form>
          <p class="hint">@${esc(u.username)}${u.is_admin ? ' · admin' : ''} · This name is what the family sees on your tasks and notes.</p>
          <div class="error" id="name-error"></div>
          <div class="actions profile-actions">
            <label class="btn" for="avatar-file" id="avatar-pick">${u.avatar_v ? 'Change photo' : 'Add photo'}</label>
            <input id="avatar-file" type="file" accept="image/*" hidden />
            ${u.avatar_v ? '<button class="btn ghost" type="button" id="avatar-remove">Remove photo</button>' : ''}
          </div>
          <div class="error" id="avatar-error"></div>
        </div>
      </div>
      <div class="actions" style="justify-content:flex-start;margin-top:12px"><button class="btn" data-action="logout">Sign out</button></div>
    </div>
    <div class="card">
      <h2>Change password</h2>
      <form class="form" id="pw-form" autocomplete="on">
        <div class="field"><label for="pw-cur">Current password</label>${passwordField({ id: 'pw-cur', name: 'current', autocomplete: 'current-password' })}</div>
        <div class="field"><label for="pw-new">New password</label>${passwordField({ id: 'pw-new', name: 'next', autocomplete: 'new-password', minlength: 8 })}</div>
        <div class="field"><label for="pw-new2">Repeat new password</label>${passwordField({ id: 'pw-new2', name: 'next2', autocomplete: 'new-password', minlength: 8 })}</div>
        <div class="error" id="pw-error"></div>
        <div class="actions"><button class="btn primary" type="submit" id="pw-save">Change password</button></div>
      </form>
    </div>`;
}

export function bindAccount(root) {
  const form = root.querySelector('#pw-form');
  const err = root.querySelector('#pw-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    if (f.get('next') !== f.get('next2')) {
      err.textContent = 'The new passwords do not match';
      return;
    }
    try {
      await withPending(root.querySelector('#pw-save'), 'Saving…', () =>
        api('/api/auth/password', { method: 'PATCH', body: { current: f.get('current'), next: f.get('next') } }),
      );
      form.reset();
      toast('Password changed');
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  const nameForm = root.querySelector('#name-form');
  const nerr = root.querySelector('#name-error');
  nameForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    nerr.textContent = '';
    const display_name = nameForm.elements.display_name.value.trim();
    if (!display_name || display_name === state.user.display_name) return;
    try {
      const { user } = await withPending(root.querySelector('#name-save'), 'Saving…', () =>
        api('/api/auth/me', { method: 'PATCH', body: { display_name } }),
      );
      state.user = user;
      await loadUsers();
      render();
      toast('Name updated');
    } catch (ex) {
      nerr.textContent = ex.message;
    }
  });

  const file = root.querySelector('#avatar-file');
  const pick = root.querySelector('#avatar-pick');
  const aerr = root.querySelector('#avatar-error');
  file?.addEventListener('change', async () => {
    const chosen = file.files?.[0];
    if (!chosen) return;
    aerr.textContent = '';
    const label = pick.textContent;
    pick.textContent = 'Uploading…';
    pick.classList.add('disabled');
    try {
      const data = await squareJpeg(chosen, AVATAR_SIZE);
      const { user } = await api('/api/users/me/avatar', { method: 'PUT', body: { data } });
      await afterAvatarChange(user, 'Photo updated');
    } catch (ex) {
      aerr.textContent = ex.message;
      pick.textContent = label;
      pick.classList.remove('disabled');
      file.value = '';
    }
  });

  root.querySelector('#avatar-remove')?.addEventListener('click', async (e) => {
    try {
      const { user } = await withPending(e.currentTarget, 'Removing…', () => api('/api/users/me/avatar', { method: 'DELETE' }));
      await afterAvatarChange(user, 'Photo removed');
    } catch (ex) {
      aerr.textContent = ex.message;
    }
  });
}

async function afterAvatarChange(user, msg) {
  state.user = user;
  await loadUsers();
  render();
  toast(msg);
}

/**
 * Read an image file, crop it to a centered square and scale it down, returning a JPEG data URL.
 * Keeps uploads around 10-20 KB regardless of the original photo size.
 */
function squareJpeg(file, size) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not an image we can read'));
      img.onload = () => {
        const s = Math.min(img.naturalWidth, img.naturalHeight);
        if (!s) return reject(new Error('That image is empty'));
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
