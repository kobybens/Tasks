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
  const db = await createDb('memory://');
  await runMigrations(db);
  const quiet = { warn() {}, info() {} };
  assert.equal(await bootstrapAdmin(db, {}, quiet), false);
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'bosspw' }, quiet), true);
  assert.equal(await bootstrapAdmin(db, { ADMIN_USERNAME: 'other', ADMIN_PASSWORD: 'x' }, quiet), false);
  const { rows } = await db.query('SELECT username, is_admin FROM users');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].username, 'boss');
  assert.equal(Number(rows[0].is_admin), 1);
});

test('login is rate limited', async () => {
  const { app: limited } = await makeApp();
  // helper created app with loginLimit 1000; build a strict one here
  const { createApp } = await import('../server/index.js');
  const { createDb, runMigrations } = await import('../server/db.js');
  const db = await createDb('memory://');
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

test('a username is locked after too many failed attempts, even with the right password', async () => {
  const { createApp } = await import('../server/index.js');
  const { createDb, runMigrations } = await import('../server/db.js');
  const { createUser } = await import('../server/auth.js');
  const db = await createDb('memory://');
  await runMigrations(db);
  await createUser(db, { username: 'dana', display_name: 'Dana', password: 'dana-pass-1', color: '#123456' });
  await createUser(db, { username: 'eli', display_name: 'Eli', password: 'eli-pass-12', color: '#654321' });
  const app2 = createApp({ db, sessionSecret: 's', loginLimit: 1000, userLoginLimit: 2 });
  const attempt = (username, password) => request(app2).post('/api/auth/login').send({ username, password });

  assert.equal((await attempt('dana', 'wrong')).status, 401);
  assert.equal((await attempt('DANA', 'wrong')).status, 401);
  const locked = await attempt('dana', 'dana-pass-1');
  assert.equal(locked.status, 429);
  assert.match(locked.body.error, /Too many failed attempts/);
  // Other users are unaffected.
  assert.equal((await attempt('eli', 'eli-pass-12')).status, 200);
});

test('security headers are present', async () => {
  const res = await request(app).get('/');
  assert.match(res.headers['content-security-policy'], /default-src 'self'/);
  assert.match(res.headers['content-security-policy'], /frame-ancestors 'none'/);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('a user can change their own display name but not their username or admin flag', async () => {
  const agent = await loginAs(app, 'noa');
  assert.equal((await agent.patch('/api/auth/me').send({ display_name: '  ' })).status, 400);
  assert.equal((await agent.patch('/api/auth/me').send({ display_name: 'x'.repeat(41) })).status, 400);
  assert.equal((await agent.patch('/api/auth/me').send({})).status, 400);
  const ok = await agent.patch('/api/auth/me').send({ display_name: ' Noa B. ', is_admin: true, username: 'boss' });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.display_name, 'Noa B.');
  assert.equal(ok.body.user.username, 'noa');
  assert.equal(ok.body.user.is_admin, false);
  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.user.display_name, 'Noa B.');
  assert.equal((await agent.patch('/api/auth/me').send({ color: 'blue' })).status, 400);
  assert.equal((await agent.patch('/api/auth/me').send({ color: '#123456' })).body.user.color, '#123456');
});
