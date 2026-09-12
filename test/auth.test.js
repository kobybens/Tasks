import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, loginAs, PW } from './helpers.js';
import { bootstrapAdmin } from '../server/auth.js';
import { createDb, runMigrations } from '../server/db.js';

let app;
before(async () => {
  ({ app } = await makeApp());
});

test('health endpoint is public', async () => {
  const res = await request(app).get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('login succeeds and /me returns the user', async () => {
  const agent = await loginAs(app, 'noa');
  const me = await agent.get('/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.body.user.username, 'noa');
  assert.equal(me.body.user.is_admin, false);
  assert.equal(me.body.user.password_hash, undefined);
});

test('login is case-insensitive on username', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'NOA', password: PW });
  assert.equal(res.status, 200);
});

test('wrong password gives a generic 401', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'noa', password: 'nope' });
  assert.equal(res.status, 401);
  const res2 = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'nope' });
  assert.equal(res2.status, 401);
  assert.equal(res.body.error, res2.body.error);
});

test('missing fields give 400', async () => {
  const res = await request(app).post('/api/auth/login').send({ username: 'noa' });
  assert.equal(res.status, 400);
});

test('/me without a cookie is 401, and protected routes too', async () => {
  assert.equal((await request(app).get('/api/auth/me')).status, 401);
  assert.equal((await request(app).get('/api/tasks?from=2026-09-13&to=2026-09-19')).status, 401);
  assert.equal((await request(app).get('/api/car?from=2026-09-13&to=2026-09-19')).status, 401);
  assert.equal((await request(app).get('/api/users')).status, 401);
});

test('logout clears the session', async () => {
  const agent = await loginAs(app, 'orit');
  assert.equal((await agent.post('/api/auth/logout')).status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('user can change own password with the current one', async () => {
  const agent = await loginAs(app, 'orit');
  const bad = await agent.patch('/api/auth/password').send({ current: 'wrong', next: 'newpass1' });
  assert.equal(bad.status, 400);
  const short = await agent.patch('/api/auth/password').send({ current: PW, next: 'ab' });
  assert.equal(short.status, 400);
  const ok = await agent.patch('/api/auth/password').send({ current: PW, next: 'newpass1' });
  assert.equal(ok.status, 200);
  assert.equal((await request(app).post('/api/auth/login').send({ username: 'orit', password: PW })).status, 401);
  assert.equal((await request(app).post('/api/auth/login').send({ username: 'orit', password: 'newpass1' })).status, 200);
});

test('unknown /api route is JSON 404', async () => {
  const res = await request(app).get('/api/nope');
  assert.equal(res.status, 404);
  assert.equal(res.body.error, 'Not found');
});

test('bootstrapAdmin creates the admin only on an empty database', async () => {
  const db = createDb('file::memory:');
  await runMigrations(db);
  const quiet = { warn() {}, info() {} };
  assert.equal(await bootstrapAdmin(db, {}, quiet), false);
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'bosspw' }, quiet), true);
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'other', ADMIN_PASSWORD: 'x' }, quiet), false);
  const { rows } = await db.execute('SELECT username, is_admin FROM users');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'boss');
  assert.equal(Number(rows[0].is_admin), 1);
});

test('login is rate limited', async () => {
  const { app: limited } = await makeApp();
  // helper created app with loginLimit 1000; build a strict one here
  const { createApp } = await import('../server/index.js');
  const { createDb, runMigrations } = await import('../server/db.js');
  const db = createDb('file::memory:');
  await runMigrations(db);
  const strict = createApp({ db, sessionSecret: 's', loginLimit: 2 });
  void limited;
  const r1 = await request(strict).post('/api/auth/login').send({ username: 'x', password: 'y' });
  const r2 = await request(strict).post('/api/auth/login').send({ username: 'x', password: 'y' });
  const r3 = await request(strict).post('/api/auth/login').send({ username: 'x', password: 'y' });
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.equal(r3.status, 429);
});
