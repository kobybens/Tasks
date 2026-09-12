import { api, state, loadShopping, render, toast, withPending } from '../app.js';
import { closeSheet, esc, openSheet } from '../lib.js';

export function renderShopping(state) {
  const open = state.shopping.filter((i) => !i.done);
  const done = state.shopping.filter((i) => i.done);
  return `
    <div class="card">
      <h2>Super</h2>
      <form class="shop-form" id="shop-form" autocomplete="off">
        <input name="text" maxlength="200" placeholder="Add something to buy…" aria-label="Item to buy" required />
        <button class="btn primary" type="submit" id="shop-add">Add</button>
      </form>
      <div class="error" id="shop-error"></div>
      <div class="shop-list" id="shop-list">
        ${state.loading ? '<div class="empty">Loading…</div>' : ''}
        ${!state.loading && !state.shopping.length ? '<div class="empty">The list is empty. Add the first item above.</div>' : ''}
        ${open.map(renderItem).join('')}
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

export function bindShopping(root) {
  const form = root.querySelector('#shop-form');
  const err = root.querySelector('#shop-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const input = form.elements.text;
    const text = input.value.trim();
    if (!text) return;
    try {
      const { item } = await withPending(root.querySelector('#shop-add'), '…', () => api('/api/shopping', { method: 'POST', body: { text } }));
      state.shopping.push(item);
      render();
      root.querySelector('#shop-form input')?.focus();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

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
    try {
      const { item: updated } = await withPending(sheet.querySelector('#se-save'), 'Saving…', () =>
        api(`/api/shopping/${item.id}`, { method: 'PATCH', body: { text: new FormData(form).get('text') } }),
      );
      Object.assign(item, updated);
      closeSheet();
      render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}
