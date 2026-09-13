import { addDays, avatarHtml, esc, fmtDay, fmtTime, todayIso, WEEKDAYS } from '../lib.js';

/**
 * Seven day cards. mode 'week' shows tasks and car bookings; mode 'car' shows bookings only.
 */
export function renderWeek(state, mode) {
  const today = todayIso();
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  const byId = new Map(state.users.map((u) => [u.id, u]));
  return `<div class="days">${days.map((d, i) => renderDay(state, mode, d, i, d === today, byId)).join('')}</div>`;
}

function renderDay(state, mode, date, weekdayIdx, isToday, byId) {
  const tasks = state.occurrences.filter((o) => o.date === date);
  const bookings = state.bookings.filter((b) => overlapsDay(b, date));
  const addAction = mode === 'car' ? 'add-car' : 'add-task';
  const addLabel = mode === 'car' ? 'Book the car' : 'Add task';

  let body = '';
  if (state.loading) {
    body = '<div class="empty">Loading…</div>';
  } else if (mode === 'week') {
    body += tasks.map((o) => renderTask(o, byId)).join('');
    if (bookings.length) body += `<div class="section-label">Car</div>${bookings.map((b) => renderBooking(b, date, byId)).join('')}`;
    if (!tasks.length && !bookings.length) body = '<div class="empty">Nothing planned</div>';
  } else {
    body = bookings.length ? bookings.map((b) => renderBooking(b, date, byId)).join('') : '<div class="empty">Car is free</div>';
  }

  return `
    <section class="day${isToday ? ' today' : ''}" aria-label="${WEEKDAYS[weekdayIdx]} ${fmtDay(date)}${isToday ? ', today' : ''}">
      <div class="day-head">
        <div class="d">${WEEKDAYS[weekdayIdx]}<small>${fmtDay(date)}</small></div>
        ${isToday ? '<span class="pill">Today</span>' : ''}
        <button class="btn icon ghost" data-action="${addAction}" data-date="${date}" aria-label="${addLabel}" title="${addLabel}">＋</button>
      </div>
      <div class="day-body">${body}</div>
    </section>`;
}

/** Prefer the live user record (has the photo version); fall back to the embedded name/color. */
function person(byId, id, embedded) {
  return byId.get(Number(id)) ?? embedded;
}

function renderTask(o, byId) {
  const who = person(byId, o.assignee_id ?? o.assignee?.id, o.assignee);
  return `
    <div class="row${o.done ? ' done' : ''}" style="--who:${esc(o.assignee.color)}">
      <button class="check" role="checkbox" aria-checked="${o.done}" data-action="toggle-done" data-task="${o.task_id}" data-date="${o.date}" aria-label="Mark ${esc(o.title)} done">${o.done ? '✓' : ''}</button>
      <button class="edit" data-action="edit-task" data-task="${o.task_id}" data-date="${o.date}" aria-label="Edit ${esc(o.title)}">
        <div class="t">${esc(o.title)}</div>
        <div class="m">${esc(o.assignee.display_name)}${o.kind === 'weekly' ? ' · weekly' : ''}${o.notes ? ` · ${esc(o.notes)}` : ''}</div>
      </button>
      ${avatarHtml(who, 28, 'row-avatar')}
    </div>`;
}

function renderBooking(b, date, byId) {
  const startsToday = b.start_at.slice(0, 10) === date;
  const endsToday = b.end_at.slice(0, 10) === date;
  const start = startsToday ? fmtTime(b.start_at) : `${fmtDay(b.start_at.slice(0, 10))} ${fmtTime(b.start_at)}`;
  const end = endsToday ? fmtTime(b.end_at) : `${fmtDay(b.end_at.slice(0, 10))} ${fmtTime(b.end_at)}`;
  const who = person(byId, b.user_id ?? b.driver?.id, b.driver);
  return `
    <div class="row car-row" style="--who:${esc(b.driver.color)}">
      <button class="edit" data-action="edit-car" data-id="${b.id}" aria-label="Edit car booking ${start} to ${end}">
        <div class="t">${start}–${end}</div>
        <div class="m">${esc(b.driver.display_name)}${b.note ? ` · ${esc(b.note)}` : ''}</div>
      </button>
      ${avatarHtml(who, 28, 'row-avatar')}
    </div>`;
}

function overlapsDay(b, date) {
  return b.start_at < `${addDays(date, 1)}T00:00` && b.end_at > `${date}T00:00`;
}
