import { dateRange, weekday } from './dates.js';

/**
 * Expand task definitions into dated occurrences within [from, to].
 *
 * @param {Array} tasks rows from the tasks table joined with assignee_name / assignee_color
 * @param {Array<{task_id:number,date:string,completed_by:number|null}>} completions
 * @param {string} from YYYY-MM-DD inclusive
 * @param {string} to   YYYY-MM-DD inclusive
 */
export function expandTasks(tasks, completions, from, to) {
  const done = new Map(completions.map((c) => [`${c.task_id}|${c.date}`, c]));
  const out = [];
  for (const date of dateRange(from, to)) {
    const wd = weekday(date);
    for (const t of tasks) {
      if (!occursOn(t, date, wd)) continue;
      const c = done.get(`${t.id}|${date}`);
      out.push({
        task_id: t.id,
        date,
        title: t.title,
        notes: t.notes ?? null,
        kind: t.kind,
        weekday: t.weekday ?? null,
        start_date: t.start_date ?? null,
        end_date: t.end_date ?? null,
        assignee: { id: t.assignee_id, display_name: t.assignee_name, color: t.assignee_color },
        done: Boolean(c),
        completed_by: c?.completed_by ?? null,
      });
    }
  }
  out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.assignee.display_name.localeCompare(b.assignee.display_name) ||
      a.title.localeCompare(b.title),
  );
  return out;
}

function occursOn(task, date, wd) {
  if (task.kind === 'once') return task.date === date;
  if (task.kind !== 'weekly' || task.weekday !== wd) return false;
  if (task.start_date && date < task.start_date) return false;
  if (task.end_date && date > task.end_date) return false;
  return true;
}
