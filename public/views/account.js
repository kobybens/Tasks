import { api, toast, withPending } from '../app.js';
import { esc } from '../lib.js';

export function renderAccount(state) {
  return `
    <div class="card">
      <h2>Signed in as ${esc(state.user.display_name)}</h2>
      <p class="hint">Username @${esc(state.user.username)}${state.user.is_admin ? ' · admin' : ''}</p>
      <div class="actions" style="justify-content:flex-start"><button class="btn" data-action="logout">Sign out</button></div>
    </div>
    <div class="card">
      <h2>Change password</h2>
      <form class="form" id="pw-form" autocomplete="on">
        <div class="field"><label for="pw-cur">Current password</label><input id="pw-cur" name="current" type="password" required autocomplete="current-password" /></div>
        <div class="field"><label for="pw-new">New password</label><input id="pw-new" name="next" type="password" required minlength="8" autocomplete="new-password" /></div>
        <div class="field"><label for="pw-new2">Repeat new password</label><input id="pw-new2" name="next2" type="password" required minlength="8" autocomplete="new-password" /></div>
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
}
