const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** True for a real calendar date in YYYY-MM-DD form. */
export function isIsoDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** True for YYYY-MM-DDTHH:MM with a valid date and time. */
export function isIsoDateTime(s) {
  if (typeof s !== 'string' || !ISO_DATETIME.test(s)) return false;
  const [date, time] = s.split('T');
  const [h, m] = time.split(':').map(Number);
  return isIsoDate(date) && h >= 0 && h < 24 && m >= 0 && m < 60;
}

/** 0 = Sunday ... 6 = Saturday, computed in UTC so the local timezone never shifts the day. */
export function weekday(isoDate) {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/** Add n days (may be negative) to a YYYY-MM-DD string. */
export function addDays(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every date from `from` to `to` inclusive. */
export function dateRange(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Number of days between two dates (to - from). */
export function daysBetween(from, to) {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
