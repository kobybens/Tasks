import { addDays, esc, fmtDay, fmtTime, todayIso, WEEKDAYS } from '../lib.js';

/**
 * Seven day cards. mode 'week' shows tasks and car bookings; mode 'car' shows bookings only.
 */
export function renderWeek(state, mode) {
  const today = todayIso();
  const days = Array.from({ length: 7 }, (_, i) => addDays(state.weekStart, i));
  return `<div class="days">${days.map((d, i) => renderDay(state, mode, d, i, d === today)).join('')}</div>`;
}

function renderDay(state, mode, date, weekdayIdx, isToday) {
  const tasks = state.occurrences.filter((o) => o.date === date);
  const bookings = state.bookings.filter((b) => overlapsDay(b, date));
  const addAction = mode === 'car' ? 'add-car' : 'add-task';
  const addLabel = mode === 'car' ? 'Book the car' : 'Add task';

  let body = '';
  if (mode === 'week') {
    body += tasks.length ? tasks.map(renderTask).join('') : '';
    if (bookings.length) body += `<div class="section-label">Car</div>${bookings.map((b) => renderBooking(b, date)).join('')}`;
    if (!tasks.length && !bookings.length) body = '<div class="empty">Nothing planned</div>';
  } else {
    body = bookings.length ? bookings.map((b) => renderBooking(b, date)).join('') : '<div class="empty">Car is free</div>';
  }

  return `
    <section class="day${isToday ? ' today' : ''}" aria-label="${WEEKDAYS[weekdayIdx]} ${fmtDay(date)}">
      <div class="day-head">
        <div class="d">${WEEKDAYS[weekdayIdx]}<small>${fmtDay(date)}${isToday ? ' · Today' : ''}</small></div>
        <button class="btn icon ghost" data-action="${addAction}" data-date="${date}" aria-label="${addLabel}" title="${addLabel}">＋</button>
      </div>
      <div class="day-body">${body}</div>
    </section>`;
}

function renderTask(o) {
  return `
    <div class="row${o.done ? ' done' : ''}" style="--who:${esc(o.assignee.color)}">
      <button class="check" role="checkbox" aria-checked="${o.done}" data-action="toggle-done" data-task="${o.task_id}" data-date="${o.date}" aria-label="Mark ${esc(o.title)} done">${o.done ? '✓' : ''}</button>
      <button class="edit" data-action="edit-task" data-task="${o.task_id}" data-date="${o.date}">
        <div class="t">${esc(o.title)}</div>
        <div class="m">${esc(o.assignee.display_name)}${o.kind === 'weekly' ? ' · weekly' : ''}${o.notes ? ` · ${esc(o.notes)}` : ''}</div>
      </button>
    </div>`;
}

function renderBooking(b, date) {
  const startsToday = b.start_at.slice(0, 10) === date;
  const endsToday = b.end_at.slice(0, 10) === date;
  const start = startsToday ? fmtTime(b.start_at) : `${fmtDay(b.start_at.slice(0, 10))} ${fmtTime(b.start_at)}`;
  const end = endsToday ? fmtTime(b.end_at) : `${fmtDay(b.end_at.slice(0, 10))} ${fmtTime(b.end_at)}`;
  return `
    <div class="row car-row" style="--who:${esc(b.driver.color)}">
      <button class="edit" data-action="edit-car" data-id="${b.id}">
        <div class="t">${start}–${end}</div>
        <div class="m">${esc(b.driver.display_name)}${b.note ? ` · ${esc(b.note)}` : ''}</div>
      </button>
    </div>`;
}

function overlapsDay(b, date) {
  return b.start_at < `${addDays(date, 1)}T00:00` && b.end_at > `${date}T00:00`;
}
