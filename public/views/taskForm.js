import { api, state, loadWeek, toast } from '../app.js';
import { closeSheet, esc, openSheet, userOptions, weekday, WEEKDAYS } from '../lib.js';

/**
 * Open the add/edit task sheet.
 * @param {{date?: string, occurrence?: object}} opts  date for a new task, or an occurrence to edit
 */
export function openTaskForm({ date, occurrence }) {
  const editing = Boolean(occurrence);
  const t = occurrence ?? { title: '', notes: '', kind: 'once', date, weekday: weekday(date), assignee: { id: state.user.id } };
  const kind = t.kind;
  const sheet = openSheet(`
    <h2>${editing ? 'Edit task' : 'New task'}</h2>
    <form class="form" id="task-form">
      <div class="field"><label for="tf-title">Task</label><input id="tf-title" name="title" required maxlength="200" placeholder="e.g. Clean the bathroom" value="${esc(t.title)}" /></div>
      <div class="field"><label for="tf-assignee">Who</label><select id="tf-assignee" name="assignee_id">${userOptions(state.users, t.assignee.id)}</select></div>
      <div class="field">
        <label>When</label>
        <div class="radio-row">
          <label><input type="radio" name="kind" value="once" ${kind === 'once' ? 'checked' : ''} /> One day</label>
          <label><input type="radio" name="kind" value="weekly" ${kind === 'weekly' ? 'checked' : ''} /> Every week</label>
        </div>
      </div>
      <div class="field" data-kind="once"><label for="tf-date">Date</label><input id="tf-date" name="date" type="date" value="${esc(t.date ?? date ?? '')}" /></div>
      <div data-kind="weekly" class="form">
        <div class="field"><label for="tf-weekday">Day of week</label>
          <select id="tf-weekday" name="weekday">${WEEKDAYS.map((w, i) => `<option value="${i}" ${Number(t.weekday) === i ? 'selected' : ''}>${w}</option>`).join('')}</select>
        </div>
        <div class="two">
          <div class="field"><label for="tf-start">From (optional)</label><input id="tf-start" name="start_date" type="date" value="${esc(t.start_date ?? '')}" /></div>
          <div class="field"><label for="tf-end">Until (optional)</label><input id="tf-end" name="end_date" type="date" value="${esc(t.end_date ?? '')}" /></div>
        </div>
      </div>
      <div class="field"><label for="tf-notes">Notes (optional)</label><textarea id="tf-notes" name="notes" maxlength="1000">${esc(t.notes ?? '')}</textarea></div>
      <div class="error" id="tf-error"></div>
      <div class="actions">
        ${editing ? '<button type="button" class="btn danger" id="tf-delete">Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" id="tf-cancel">Cancel</button>
        <button type="submit" class="btn primary">Save</button>
      </div>
    </form>`);

  const form = sheet.querySelector('#task-form');
  const err = sheet.querySelector('#tf-error');
  const syncKind = () => {
    const k = form.elements.kind.value;
    sheet.querySelectorAll('[data-kind]').forEach((el) => (el.hidden = el.dataset.kind !== k));
  };
  syncKind();
  form.addEventListener('change', (e) => e.target.name === 'kind' && syncKind());
  sheet.querySelector('#tf-cancel').addEventListener('click', closeSheet);
  sheet.querySelector('#tf-title').focus();

  sheet.querySelector('#tf-delete')?.addEventListener('click', async () => {
    const msg = t.kind === 'weekly' ? 'Delete this weekly task from every week?' : 'Delete this task?';
    if (!confirm(msg)) return;
    try {
      await api(`/api/tasks/${t.task_id}`, { method: 'DELETE' });
      closeSheet();
      toast('Task deleted');
      await loadWeek();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    const k = f.get('kind');
    const body = {
      title: f.get('title'),
      notes: f.get('notes'),
      assignee_id: Number(f.get('assignee_id')),
      kind: k,
      date: k === 'once' ? f.get('date') : null,
      weekday: k === 'weekly' ? Number(f.get('weekday')) : null,
      start_date: k === 'weekly' ? f.get('start_date') || null : null,
      end_date: k === 'weekly' ? f.get('end_date') || null : null,
    };
    try {
      if (editing) await api(`/api/tasks/${t.task_id}`, { method: 'PATCH', body });
      else await api('/api/tasks', { method: 'POST', body });
      closeSheet();
      toast(editing ? 'Task updated' : 'Task added');
      await loadWeek();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}
