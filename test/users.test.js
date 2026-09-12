import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAs } from './helpers.js';

let app, users, admin, noa;
before(async () => {
  ({ app, users } = await makeApp());
  admin = await loginAs(app, 'admin');
  noa = await loginAs(app, 'noa');
});

test('any logged-in user can list users without password hashes', async () => {
  const res = await noa.get('/api/users');
  assert.equal(res.status, 200);
  assert.equal(res.body.users.length, 3);
  assert.deepEqual(Object.keys(res.body.users[0]).sort(), ['color', 'display_name', 'id', 'is_admin', 'username']);
});

test('non-admin cannot create, edit, or delete users', async () => {
  assert.equal((await noa.post('/api/users').send({ username: 'x', display_name: 'X', password: 'pass1', color: '#123456' })).status, 403);
  assert.equal((await noa.patch(`/api/users/${users.orit}`).send({ display_name: 'Hacked' })).status, 403);
  assert.equal((await noa.delete(`/api/users/${users.orit}`)).status, 403);
});

test('admin creates a user who can then log in', async () => {
  const res = await admin.post('/api/users').send({ username: 'maya', display_name: 'Maya', password: 'maya123', color: '#0000ff' });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.username, 'maya');
  assert.equal(res.body.user.is_admin, false);
  const maya = await loginAs(app, 'maya', 'maya123');
  assert.equal((await maya.get('/api/auth/me')).body.user.display_name, 'Maya');
});

test('creating a user validates input and rejects duplicates', async () => {
  assert.equal((await admin.post('/api/users').send({ username: 'a', display_name: 'A', password: 'pass1', color: '#123456' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ username: 'ok', display_name: '', password: 'pass1', color: '#123456' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ username: 'ok', display_name: 'Ok', password: 'ab', color: '#123456' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ username: 'ok', display_name: 'Ok', password: 'pass1', color: 'red' })).status, 400);
  assert.equal((await admin.post('/api/users').send({ username: 'NOA', display_name: 'Dup', password: 'pass1', color: '#123456' })).status, 409);
});

test('admin resets a password and edits display name and color', async () => {
  const res = await admin.patch(`/api/users/${users.orit}`).send({ display_name: 'Orit B', color: '#abcdef', password: 'reset99' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.display_name, 'Orit B');
  assert.equal(res.body.user.color, '#abcdef');
  const orit = await loginAs(app, 'orit', 'reset99');
  assert.equal((await orit.get('/api/auth/me')).status, 200);
});

test('admin cannot delete self or the last admin, or demote the last admin', async () => {
  assert.equal((await admin.delete(`/api/users/${users.admin}`)).status, 400);
  assert.equal((await admin.patch(`/api/users/${users.admin}`).send({ is_admin: false })).status, 400);
  // promote noa, then admin can be demoted
  assert.equal((await admin.patch(`/api/users/${users.noa}`).send({ is_admin: true })).status, 200);
  assert.equal((await admin.patch(`/api/users/${users.admin}`).send({ is_admin: false })).status, 200);
  // restore
  const noaAdmin = await loginAs(app, 'noa');
  assert.equal((await noaAdmin.patch(`/api/users/${users.admin}`).send({ is_admin: true })).status, 200);
  assert.equal((await admin.patch(`/api/users/${users.noa}`).send({ is_admin: false })).status, 200);
});

test('admin deletes a user and their tasks cascade', async () => {
  const created = await admin.post('/api/users').send({ username: 'temp', display_name: 'Temp', password: 'temp123', color: '#222222' });
  const id = created.body.user.id;
  const task = await admin.post('/api/tasks').send({ title: 'Temp task', assignee_id: id, kind: 'once', date: '2026-09-15' });
  assert.equal(task.status, 201);
  assert.equal((await admin.delete(`/api/users/${id}`)).status, 200);
  assert.equal((await admin.delete(`/api/users/${id}`)).status, 404);
  const occ = await admin.get('/api/tasks?from=2026-09-15&to=2026-09-15');
  assert.equal(occ.body.occurrences.filter((o) => o.title === 'Temp task').length, 0);
});
