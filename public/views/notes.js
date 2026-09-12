import { api, state, loadNotes, render, toast, withPending } from '../app.js';
import { closeSheet, esc, fmtDateTime, openSheet } from '../lib.js';

export function renderNotes(state) {
  return `
    <div class="card">
      <h2>Notes</h2>
      <form class="form" id="note-form">
        <textarea name="text" maxlength="2000" placeholder="Write a note for the family…" aria-label="New note" required></textarea>
        <div class="actions"><button class="btn primary" type="submit" id="note-add">Add note</button></div>
      </form>
      <div class="error" id="note-error"></div>
    </div>
    <div class="notes" id="note-list">
      ${state.loading ? '<div class="empty">Loading…</div>' : ''}
      ${!state.loading && !state.notes.length ? '<div class="empty">No notes yet. Anything the family should know goes here.</div>' : ''}
      ${state.notes.map(renderNote).join('')}
    </div>`;
}

function renderNote(n) {
  const who = n.author ? esc(n.author.display_name) : 'someone who left';
  const color = n.author?.color ?? 'var(--border)';
  const when = fmtDateTime(n.created_at);
  const edited = n.edited_by ? ` · edited by ${esc(n.edited_by)}` : n.updated_at > n.created_at ? ' · edited' : '';
  return `
    <article class="note" style="--who:${esc(color)}">
      <div class="note-meta">
        <span>Added by <b class="note-author">${who}</b> · ${when}${edited}</span>
        <span class="note-ops">
          <button class="btn ghost" data-note-edit="${n.id}">Edit</button>
          <button class="btn icon ghost note-del" data-note-del="${n.id}" aria-label="Delete note by ${who}" title="Delete">×</button>
        </span>
      </div>
      <button class="note-body" data-note-edit="${n.id}" aria-label="Edit note by ${who}"><div class="note-text">${esc(n.text)}</div></button>
    </article>`;
}

export function bindNotes(root) {
  const form = root.querySelector('#note-form');
  const err = root.querySelector('#note-error');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const text = form.elements.text.value.trim();
    if (!text) return;
    try {
      const { note } = await withPending(root.querySelector('#note-add'), 'Adding…', () => api('/api/notes', { method: 'POST', body: { text } }));
      state.notes.unshift(note);
      render();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  root.querySelector('#note-list')?.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-note-del]');
    if (del) {
      const note = state.notes.find((n) => n.id === Number(del.dataset.noteDel));
      if (!note) return;
      const by = note.author ? note.author.display_name : 'someone who left';
      if (!confirm(`Delete the note by ${by}?`)) return;
      try {
        await api(`/api/notes/${note.id}`, { method: 'DELETE' });
        state.notes = state.notes.filter((n) => n.id !== note.id);
        render();
        toast('Note deleted');
      } catch (ex) {
        if (ex.status !== 401) toast(ex.message, true);
      }
      return;
    }
    const edit = e.target.closest('[data-note-edit]');
    if (!edit) return;
    const note = state.notes.find((n) => n.id === Number(edit.dataset.noteEdit));
    if (note) openNoteSheet(note);
  });
}

function openNoteSheet(note) {
  const sheet = openSheet(`
    <h2>Edit note</h2>
    <form class="form" id="note-edit-form">
      <div class="field"><label for="ne-text">Note</label><textarea id="ne-text" name="text" required maxlength="2000" rows="6">${esc(note.text)}</textarea></div>
      <p class="hint">Added by ${note.author ? esc(note.author.display_name) : 'someone who left'} on ${fmtDateTime(note.created_at)}.</p>
      <div class="error" id="ne-error"></div>
      <div class="actions">
        <button type="button" class="btn danger" id="ne-delete">Delete</button>
        <span class="spacer"></span>
        <button type="button" class="btn" id="ne-cancel">Cancel</button>
        <button type="submit" class="btn primary" id="ne-save">Save changes</button>
      </div>
    </form>`);
  const form = sheet.querySelector('#note-edit-form');
  const err = sheet.querySelector('#ne-error');
  sheet.querySelector('#ne-cancel').addEventListener('click', closeSheet);
  sheet.querySelector('#ne-delete').addEventListener('click', async (e) => {
    if (!confirm('Delete this note?')) return;
    try {
      await withPending(e.currentTarget, 'Deleting…', () => api(`/api/notes/${note.id}`, { method: 'DELETE' }));
      closeSheet();
      toast('Note deleted');
      await loadNotes();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    try {
      await withPending(sheet.querySelector('#ne-save'), 'Saving…', () =>
        api(`/api/notes/${note.id}`, { method: 'PATCH', body: { text: new FormData(form).get('text') } }),
      );
      closeSheet();
      toast('Note updated');
      await loadNotes();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}
