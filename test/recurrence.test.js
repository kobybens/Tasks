import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandTasks } from '../server/lib/recurrence.js';
import { weekday, addDays, isIsoDate, isIsoDateTime, dateRange } from '../server/lib/dates.js';

const noa = { assignee_id: 1, assignee_name: 'Noa', assignee_color: '#f00' };
const orit = { assignee_id: 2, assignee_name: 'Orit', assignee_color: '#0f0' };

test('dates: weekday, addDays, validation', () => {
  assert.equal(weekday('2026-09-13'), 0); // Sunday
  assert.equal(weekday('2026-09-18'), 5); // Friday
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(dateRange('2026-09-13', '2026-09-19').length, 7);
  assert.ok(isIsoDate('2026-02-28'));
  assert.ok(!isIsoDate('2026-02-30'));
  assert.ok(!isIsoDate('2026-9-1'));
  assert.ok(isIsoDateTime('2026-09-14T16:00'));
  assert.ok(!isIsoDateTime('2026-09-14T24:00'));
  assert.ok(!isIsoDateTime('2026-09-14 16:00'));
});

test('once task appears only on its date', () => {
  const tasks = [{ id: 10, title: 'Supermarket', kind: 'once', date: '2026-09-17', ...orit }];
  const occ = expandTasks(tasks, [], '2026-09-13', '2026-09-19');
  assert.equal(occ.length, 1);
  assert.equal(occ[0].date, '2026-09-17');
  assert.equal(occ[0].assignee.display_name, 'Orit');
  assert.equal(occ[0].done, false);
});

test('weekly task appears on every matching weekday across a month boundary', () => {
  const tasks = [{ id: 11, title: 'Clean bathroom', kind: 'weekly', weekday: 5, ...noa }];
  const occ = expandTasks(tasks, [], '2026-09-13', '2026-10-10');
  assert.deepEqual(
    occ.map((o) => o.date),
    ['2026-09-18', '2026-09-25', '2026-10-02', '2026-10-09'],
  );
});

test('weekly task respects start_date and end_date', () => {
  const tasks = [
    { id: 12, title: 'Trash', kind: 'weekly', weekday: 1, start_date: '2026-09-21', end_date: '2026-09-28', ...noa },
  ];
  const occ = expandTasks(tasks, [], '2026-09-13', '2026-10-10');
  assert.deepEqual(
    occ.map((o) => o.date),
    ['2026-09-21', '2026-09-28'],
  );
});

test('done flag is attached per occurrence', () => {
  const tasks = [{ id: 11, title: 'Clean bathroom', kind: 'weekly', weekday: 5, ...noa }];
  const completions = [{ task_id: 11, date: '2026-09-18', completed_by: 1 }];
  const occ = expandTasks(tasks, completions, '2026-09-13', '2026-09-26');
  assert.equal(occ[0].done, true);
  assert.equal(occ[0].completed_by, 1);
  assert.equal(occ[1].done, false);
});

test('occurrences are sorted by date then assignee then title', () => {
  const tasks = [
    { id: 1, title: 'B', kind: 'once', date: '2026-09-15', ...orit },
    { id: 2, title: 'A', kind: 'once', date: '2026-09-15', ...orit },
    { id: 3, title: 'Z', kind: 'once', date: '2026-09-15', ...noa },
    { id: 4, title: 'Q', kind: 'once', date: '2026-09-14', ...orit },
  ];
  const occ = expandTasks(tasks, [], '2026-09-13', '2026-09-19');
  assert.deepEqual(
    occ.map((o) => o.title),
    ['Q', 'Z', 'A', 'B'],
  );
});
