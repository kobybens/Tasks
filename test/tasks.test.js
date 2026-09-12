import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAs } from './helpers.js';

let app, users, noa, orit;
before(async () => {
  ({ app, users } = await makeApp());
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
});

const WEEK = 'from=2026-09-13&to=2026-09-19'; // Sun..Sat

test('GET validates the range', async () => {
  assert.equal((await noa.get('/api/tasks')).status, 400);
  assert.equal((await noa.get('/api/tasks?from=2026-09-19&to=2026-09-13')).status, 400);
  assert.equal((await noa.get('/api/tasks?from=2026-01-01&to=2026-12-31')).status, 400);
  assert.equal((await noa.get(`/api/tasks?${WEEK}`)).status, 200);
});

test('create a weekly and a one-off task; they expand into the week', async () => {
  const weekly = await noa.post('/api/tasks').send({ title: 'Clean bathroom', assignee_id: users.noa, kind: 'weekly', weekday: 5 });
  assert.equal(weekly.status, 201);
  assert.equal(weekly.body.task.kind, 'weekly');
  assert.equal(weekly.body.task.weekday, 5);
  assert.equal(weekly.body.task.date, null);

  const once = await orit.post('/api/tasks').send({ title: 'Supermarket', assignee_id: users.orit, kind: 'once', date: '2026-09-17', notes: 'milk, bread' });
  assert.equal(once.status, 201);

  const res = await noa.get(`/api/tasks?${WEEK}`);
  const occ = res.body.occurrences;
  assert.equal(occ.length, 2);
  const bath = occ.find((o) => o.title === 'Clean bathroom');
  const shop = occ.find((o) => o.title === 'Supermarket');
  assert.equal(bath.date, '2026-09-18');
  assert.equal(bath.assignee.display_name, 'Noa');
  assert.equal(bath.assignee.color, '#ff0000');
  assert.equal(shop.date, '2026-09-17');
  assert.equal(shop.notes, 'milk, bread');
  assert.equal(shop.done, false);

  const next = await noa.get('/api/tasks?from=2026-09-20&to=2026-09-26');
  assert.deepEqual(next.body.occurrences.map((o) => o.title), ['Clean bathroom']);
});

test('validation errors', async () => {
  assert.equal((await noa.post('/api/tasks').send({ title: '', assignee_id: users.noa, kind: 'once', date: '2026-09-17' })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: 9999, kind: 'once', date: '2026-09-17' })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: users.noa, kind: 'weekly' })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: users.noa, kind: 'weekly', weekday: 7 })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: users.noa, kind: 'once', date: '17/09/2026' })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: users.noa, kind: 'monthly' })).status, 400);
  assert.equal((await noa.post('/api/tasks').send({ title: 'X', assignee_id: users.noa, kind: 'weekly', weekday: 1, start_date: '2026-10-01', end_date: '2026-09-01' })).status, 400);
});

test('mark done and undone per occurrence', async () => {
  const created = await noa.post('/api/tasks').send({ title: 'Trash', assignee_id: users.noa, kind: 'weekly', weekday: 1 });
  const id = created.body.task.id;
  assert.equal((await orit.put(`/api/tasks/${id}/done/2026-09-14`)).status, 200);
  assert.equal((await orit.put(`/api/tasks/${id}/done/2026-09-14`)).status, 200); // idempotent
  assert.equal((await orit.put(`/api/tasks/${id}/done/bad-date`)).status, 400);
  assert.equal((await orit.put(`/api/tasks/99999/done/2026-09-14`)).status, 404);

  let occ = (await noa.get('/api/tasks?from=2026-09-14&to=2026-09-21')).body.occurrences.filter((o) => o.task_id === id);
  assert.equal(occ.length, 2);
  assert.equal(occ[0].done, true);
  assert.equal(occ[0].completed_by, users.orit);
  assert.equal(occ[1].done, false);

  assert.equal((await noa.delete(`/api/tasks/${id}/done/2026-09-14`)).status, 200);
  occ = (await noa.get('/api/tasks?from=2026-09-14&to=2026-09-14')).body.occurrences.filter((o) => o.task_id === id);
  assert.equal(occ[0].done, false);
});

test('any user can edit and delete another user\'s task', async () => {
  const created = await noa.post('/api/tasks').send({ title: 'Dishes', assignee_id: users.noa, kind: 'once', date: '2026-09-15' });
  const id = created.body.task.id;

  const moved = await orit.patch(`/api/tasks/${id}`).send({ assignee_id: users.orit, date: '2026-09-16' });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.task.assignee_id, users.orit);
  assert.equal(moved.body.task.date, '2026-09-16');

  const toWeekly = await orit.patch(`/api/tasks/${id}`).send({ kind: 'weekly', weekday: 2 });
  assert.equal(toWeekly.status, 200);
  assert.equal(toWeekly.body.task.date, null);
  assert.equal(toWeekly.body.task.weekday, 2);

  const backToOnce = await orit.patch(`/api/tasks/${id}`).send({ kind: 'once', date: '2026-09-22' });
  assert.equal(backToOnce.status, 200);
  assert.equal(backToOnce.body.task.weekday, null);

  assert.equal((await orit.patch(`/api/tasks/${id}`).send({ title: '' })).status, 400);
  assert.equal((await orit.patch('/api/tasks/99999').send({ title: 'x' })).status, 404);

  assert.equal((await orit.delete(`/api/tasks/${id}`)).status, 200);
  assert.equal((await orit.delete(`/api/tasks/${id}`)).status, 404);
});
