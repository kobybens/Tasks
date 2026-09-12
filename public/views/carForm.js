import { api, state, loadWeek, toast, withPending } from '../app.js';
import { closeSheet, esc, fmtDay, fmtTime, openSheet, userOptions } from '../lib.js';

/**
 * Open the add/edit car booking sheet.
 * @param {{date?: string, booking?: object}} opts
 */
export function openCarForm({ date, booking }) {
  const editing = Boolean(booking);
  const b = booking ?? {
    user_id: state.user.id,
    start_at: `${date}T16:00`,
    end_at: `${date}T18:00`,
    note: '',
  };
  const sheet = openSheet(`
    <h2>${editing ? 'Edit car booking' : 'Book the car'}</h2>
    <form class="form" id="car-form">
      <div class="field"><label for="cf-user">Driver</label><select id="cf-user" name="user_id">${userOptions(state.users, b.user_id)}</select></div>
      <div class="field"><label for="cf-date">Date</label><input id="cf-date" name="date" type="date" required value="${esc(b.start_at.slice(0, 10))}" /></div>
      <div class="two">
        <div class="field"><label for="cf-start">From</label><input id="cf-start" name="start" type="time" required step="300" value="${esc(fmtTime(b.start_at))}" /></div>
        <div class="field"><label for="cf-end">Until</label><input id="cf-end" name="end" type="time" required step="300" value="${esc(fmtTime(b.end_at))}" /></div>
      </div>
      <div class="field"><label for="cf-end-date">Return date <span class="hint">(only if overnight)</span></label><input id="cf-end-date" name="end_date" type="date" value="${esc(b.end_at.slice(0, 10))}" /></div>
      <div class="field"><label for="cf-note">Note (optional)</label><input id="cf-note" name="note" maxlength="200" placeholder="e.g. Driving to grandma" value="${esc(b.note ?? '')}" /></div>
      <div class="error" id="cf-error"></div>
      <div class="actions">
        ${editing ? '<button type="button" class="btn danger" id="cf-delete">Delete</button>' : ''}
        <span class="spacer"></span>
        <button type="button" class="btn" id="cf-cancel">Cancel</button>
        <button type="submit" class="btn primary" id="cf-save">${editing ? 'Save changes' : 'Book the car'}</button>
      </div>
    </form>`);

  const form = sheet.querySelector('#car-form');
  const err = sheet.querySelector('#cf-error');
  const save = sheet.querySelector('#cf-save');
  sheet.querySelector('#cf-cancel').addEventListener('click', closeSheet);

  // Keep the return date in step with the date unless the user changed it on purpose.
  const dateEl = form.elements.date;
  const endDateEl = form.elements.end_date;
  let endDateTouched = editing && b.start_at.slice(0, 10) !== b.end_at.slice(0, 10);
  endDateEl.addEventListener('input', () => (endDateTouched = true));
  dateEl.addEventListener('input', () => {
    if (!endDateTouched) endDateEl.value = dateEl.value;
  });

  sheet.querySelector('#cf-delete')?.addEventListener('click', async (e) => {
    if (!confirm('Delete this car booking?')) return;
    try {
      await withPending(e.currentTarget, 'Deleting…', () => api(`/api/car/${b.id}`, { method: 'DELETE' }));
      closeSheet();
      toast('Booking deleted');
      await loadWeek();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const f = new FormData(form);
    const body = {
      user_id: Number(f.get('user_id')),
      start_at: `${f.get('date')}T${f.get('start')}`,
      end_at: `${f.get('end_date') || f.get('date')}T${f.get('end')}`,
      note: f.get('note'),
    };
    try {
      await withPending(save, 'Saving…', () =>
        editing ? api(`/api/car/${b.id}`, { method: 'PATCH', body }) : api('/api/car', { method: 'POST', body }),
      );
      closeSheet();
      toast(editing ? 'Booking updated' : 'Car booked');
      await loadWeek();
    } catch (ex) {
      if (ex.status === 409 && ex.body?.conflict) {
        const c = ex.body.conflict;
        const sameDay = c.start_at.slice(0, 10) === c.end_at.slice(0, 10);
        const when = sameDay
          ? `${fmtDay(c.start_at.slice(0, 10))} ${fmtTime(c.start_at)}–${fmtTime(c.end_at)}`
          : `${fmtDay(c.start_at.slice(0, 10))} ${fmtTime(c.start_at)} – ${fmtDay(c.end_at.slice(0, 10))} ${fmtTime(c.end_at)}`;
        err.textContent = `${c.driver} already has the car ${when}. Pick another time.`;
      } else {
        err.textContent = ex.message;
      }
    }
  });
}
