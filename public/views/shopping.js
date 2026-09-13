import { api, state, loadShopping, render, toast, withPending } from '../app.js';
import { closeSheet, esc, fmtDay, openSheet, todayIso } from '../lib.js';
import { formatShoppingList, whatsappUrl } from '../shopping-text.js';

const LAST_GROUP_KEY = 'shopping.lastGroup';

export function renderShopping(state) {
  const groups = state.shoppingGroups;
  const open = state.shopping.filter((i) => !i.done);
  const done = state.shopping.filter((i) => i.done);
  const selected = currentGroupId(state);
  return `
    <div class="card">
      <div class="card-head">
        <h2>Super</h2>
        <span class="card-actions">
          <button class="btn ghost" data-shop="share" ${open.length ? '' : 'disabled'} title="Share the list to WhatsApp">Share</button>
          <button class="btn ghost" data-shop="groups" ${groups.length ? '' : 'disabled'}>Groups</button>
        </span>
      </div>
      <form class="shop-form" id="shop-form" autocomplete="off">
        <input name="text" maxlength="200" placeholder="Add something to buy…" aria-label="Item to buy" required />
        <select name="group_id" aria-label="Group" id="shop-group">${groupOptions(groups, selected)}</select>
        <button class="btn primary" type="submit" id="shop-add">Add</button>
      </form>
      <div class="error" id="shop-error"></div>
      <div class="shop-list" id="shop-list">
        ${state.loading ? '<div class="empty">Loading…</div>' : ''}
        ${!state.loading && !state.shopping.length ? '<div class="empty">The list is empty. Add the first item above.</div>' : ''}
        ${groups
          .map((g) => {
            const items = open.filter((i) => i.group_id === g.id);
            if (!items.length) return '';
            return `<div class="section-label">${esc(g.name)}</div>${items.map(renderItem).join('')}`;
          })
          .join('')}
        ${
          done.length
            ? `<div class="shop-done-head">
                 <span class="section-label">Bought (${done.length})</span>
                 <button class="btn ghost" data-shop="clear" id="shop-clear">Clear bought</button>
               </div>${done.map(renderItem).join('')}`
            : ''
        }
      </div>
    </div>`;
}

function renderItem(i) {
  return `
    <div class="row shop-row${i.done ? ' done' : ''}" data-id="${i.id}">
      <button class="check" role="checkbox" aria-checked="${i.done}" data-shop="toggle" data-id="${i.id}" aria-label="Mark ${esc(i.text)} bought">${i.done ? '✓' : ''}</button>
      <button class="edit" data-shop="edit" data-id="${i.id}" aria-label="Edit ${esc(i.text)}"><div class="t">${esc(i.text)}</div></button>
      <button class="btn icon ghost shop-del" data-shop="delete" data-id="${i.id}" aria-label="Remove ${esc(i.text)}" title="Remove">×</button>
    </div>`;
}

function groupOptions(groups, selectedId) {
  return groups.map((g) => `<option value="${g.id}" ${g.id === selectedId ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
}

/** The group preselected in the add row: last one used on this device, else "Other". */
function currentGroupId(state) {
  const groups = state.shoppingGroups;
  let last = null;
  try {
    last = Number(localStorage.getItem(LAST_GROUP_KEY));
  } catch {
    /* storage unavailable */
  }
  if (last && groups.some((g) => g.id === last)) return last;
  return groups.find((g) => g.is_default)?.id ?? groups[0]?.id;
}

function rememberGroup(id) {
  try {
    localStorage.setItem(LAST_GROUP_KEY, String(id));
  } catch {
    /* storage unavailable */
  }
}

export function bindShopping(root) {
  const form = root.querySelector('#shop-form');
  const err = root.querySelector('#shop-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const text = form.elements.text.value.trim();
    const groupId = Number(form.elements.group_id.value);
    if (!text) return;
    try {
      const { item } = await withPending(root.querySelector('#shop-add'), '…', () =>
        api('/api/shopping', { method: 'POST', body: { text, group_id: groupId } }),
      );
      rememberGroup(groupId);
      state.shopping.push(item);
      render();
      root.querySelector('#shop-form input')?.focus();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  form?.elements.group_id.addEventListener('change', (e) => rememberGroup(Number(e.target.value)));

  root.querySelector('[data-shop="groups"]')?.addEventListener('click', openGroupsSheet);
  root.querySelector('[data-shop="share"]')?.addEventListener('click', shareList);

  root.querySelector('#shop-list')?.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-shop]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    const item = state.shopping.find((i) => i.id === id);
    try {
      switch (btn.dataset.shop) {
        case 'toggle': {
          if (!item) return;
          const next = !item.done;
          item.done = next;
          render();
          try {
            await api(`/api/shopping/${id}`, { method: 'PATCH', body: { done: next } });
          } catch (ex) {
            item.done = !next;
            render();
            throw ex;
          }
          break;
        }
        case 'delete':
          if (!item) return;
          await api(`/api/shopping/${id}`, { method: 'DELETE' });
          state.shopping = state.shopping.filter((i) => i.id !== id);
          render();
          break;
        case 'edit':
          if (item) openEditSheet(item);
          break;
        case 'clear': {
          const n = state.shopping.filter((i) => i.done).length;
          await withPending(btn, 'Clearing…', () => api('/api/shopping/done', { method: 'DELETE' }));
          toast(n === 1 ? '1 item cleared' : `${n} items cleared`);
          await loadShopping();
          break;
        }
        default:
          break;
      }
    } catch (ex) {
      if (ex.status !== 401) toast(ex.message, true);
    }
  });
}

function openEditSheet(item) {
  const sheet = openSheet(`
    <h2>Edit item</h2>
    <form class="form" id="shop-edit-form">
      <div class="field"><label for="se-text">Item</label><input id="se-text" name="text" required maxlength="200" value="${esc(item.text)}" /></div>
      <div class="field"><label for="se-group">Group</label><select id="se-group" name="group_id">${groupOptions(state.shoppingGroups, item.group_id)}</select></div>
      <div class="error" id="se-error"></div>
      <div class="actions">
        <button type="button" class="btn danger" id="se-delete">Remove</button>
        <span class="spacer"></span>
        <button type="button" class="btn" id="se-cancel">Cancel</button>
        <button type="submit" class="btn primary" id="se-save">Save changes</button>
      </div>
    </form>`);
  const form = sheet.querySelector('#shop-edit-form');
  const err = sheet.querySelector('#se-error');
  sheet.querySelector('#se-cancel').addEventListener('click', closeSheet);
  sheet.querySelector('#se-text').select();
  sheet.querySelector('#se-delete').addEventListener('click', async (e) => {
    try {
      await withPending(e.currentTarget, 'Removing…', () => api(`/api/shopping/${item.id}`, { method: 'DELETE' }));
      state.shopping = state.shopping.filter((i) => i.id !== item.id);
      closeSheet();
      render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    try {
      const { item: updated } = await withPending(sheet.querySelector('#se-save'), 'Saving…', () =>
        api(`/api/shopping/${item.id}`, { method: 'PATCH', body: { text: f.get('text'), group_id: Number(f.get('group_id')) } }),
      );
      Object.assign(item, updated);
      closeSheet();
      render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

/** Manage groups: rename inline, delete (items move to Other), add new. */
function openGroupsSheet() {
  const sheet = openSheet(`
    <h2>Shopping groups</h2>
    <div class="group-list" id="group-list">
      ${state.shoppingGroups
        .map(
          (g) => `
        <form class="group-row" data-group="${g.id}">
          <input name="name" maxlength="40" required value="${esc(g.name)}" aria-label="Group name" />
          <button class="btn" type="submit">Save</button>
          ${g.is_default ? '<span class="hint">Default</span>' : `<button class="btn icon ghost shop-del" type="button" data-group-del="${g.id}" aria-label="Delete group ${esc(g.name)}" title="Delete group">×</button>`}
        </form>`,
        )
        .join('')}
    </div>
    <form class="group-row" id="group-add">
      <input name="name" maxlength="40" required placeholder="New group, e.g. Baby" aria-label="New group name" />
      <button class="btn primary" type="submit">Add</button>
    </form>
    <p class="hint">Deleting a group moves its items to "Other".</p>
    <div class="error" id="group-error"></div>
    <div class="actions"><span class="spacer"></span><button type="button" class="btn" id="group-close">Done</button></div>`);
  const err = sheet.querySelector('#group-error');
  sheet.querySelector('#group-close').addEventListener('click', closeSheet);

  sheet.querySelector('#group-add').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const name = e.target.elements.name.value.trim();
    if (!name) return;
    try {
      await withPending(e.target.querySelector('button'), '…', () => api('/api/shopping/groups', { method: 'POST', body: { name } }));
      await loadShopping();
      closeSheet();
      openGroupsSheet();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  sheet.querySelector('#group-list').addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const id = Number(e.target.dataset.group);
    const name = e.target.elements.name.value.trim();
    const group = state.shoppingGroups.find((g) => g.id === id);
    if (!group || !name || name === group.name) return;
    try {
      await withPending(e.target.querySelector('button[type=submit]'), '…', () =>
        api(`/api/shopping/groups/${id}`, { method: 'PATCH', body: { name } }),
      );
      group.name = name;
      render();
      toast('Group renamed');
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  sheet.querySelector('#group-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-group-del]');
    if (!btn) return;
    const id = Number(btn.dataset.groupDel);
    const group = state.shoppingGroups.find((g) => g.id === id);
    if (!group) return;
    const count = state.shopping.filter((i) => i.group_id === id).length;
    const msg = count ? `Delete "${group.name}"? Its ${count} item${count === 1 ? '' : 's'} will move to "Other".` : `Delete "${group.name}"?`;
    if (!confirm(msg)) return;
    err.textContent = '';
    try {
      await api(`/api/shopping/groups/${id}`, { method: 'DELETE' });
      await loadShopping();
      closeSheet();
      openGroupsSheet();
      toast(`Group "${group.name}" deleted`);
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

/**
 * Share the unticked items as text. Phones get the system share sheet (pick WhatsApp there);
 * desktops open WhatsApp's click-to-chat link with the text prefilled.
 */
async function shareList() {
  const text = formatShoppingList(state.shopping, state.shoppingGroups, { date: fmtDay(todayIso()) });
  if (!text) {
    toast('Nothing left to buy, nothing to share');
    return;
  }
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch (ex) {
      if (ex?.name === 'AbortError') return; // user closed the share sheet
    }
  }
  const win = window.open(whatsappUrl(text), '_blank', 'noopener');
  if (!win) {
    try {
      await navigator.clipboard.writeText(text);
      toast('List copied. Paste it into WhatsApp.');
    } catch {
      toast('Could not open WhatsApp. Allow pop-ups and try again.', true);
    }
  }
}
