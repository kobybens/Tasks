import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, loginAs } from './helpers.js';

// 1x1 transparent PNG.
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const PNG = Buffer.from(PNG_B64, 'base64');
const PNG_URL = `data:image/png;base64,${PNG_B64}`;

let app, users, admin, noa, orit;
before(async () => {
  ({ app, users } = await makeApp());
  admin = await loginAs(app, 'admin');
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
});

test('users start without a photo', async () => {
  const list = (await noa.get('/api/users')).body.users;
  assert.ok(list.every((u) => u.avatar_v === null));
  assert.equal((await noa.get(`/api/users/${users.noa}/avatar`)).status, 404);
  assert.equal((await request(app).get(`/api/users/${users.noa}/avatar`)).status, 401);
});

test('a user uploads their own photo and everyone can fetch it', async () => {
  const up = await noa.put('/api/users/me/avatar').send({ data: PNG_URL });
  assert.equal(up.status, 200);
  assert.equal(typeof up.body.user.avatar_v, 'number');
  assert.ok(up.body.user.avatar_v > 0);

  const me = await noa.get('/api/auth/me');
  assert.equal(me.body.user.avatar_v, up.body.user.avatar_v, 'avatar version appears on /me');

  const list = (await orit.get('/api/users')).body.users;
  assert.equal(list.find((u) => u.username === 'noa').avatar_v, up.body.user.avatar_v);
  assert.equal(list.find((u) => u.username === 'orit').avatar_v, null);

  const img = await orit.get(`/api/users/${users.noa}/avatar`).buffer(true).parse(binaryParser);
  assert.equal(img.status, 200);
  assert.equal(img.headers['content-type'], 'image/png');
  assert.match(img.headers['cache-control'], /immutable/);
  assert.ok(Buffer.isBuffer(img.body));
  assert.equal(img.body.length, PNG.length);
  assert.ok(img.body.equals(PNG));
});

test('re-uploading bumps the version', async () => {
  const before = (await noa.get('/api/auth/me')).body.user.avatar_v;
  await new Promise((r) => setTimeout(r, 5));
  const up = await noa.put('/api/users/me/avatar').send({ data: PNG_URL });
  assert.ok(up.body.user.avatar_v >= before);
});

test('rejects non-images, mismatched data, and oversized photos', async () => {
  assert.equal((await noa.put('/api/users/me/avatar').send({})).status, 400);
  assert.equal((await noa.put('/api/users/me/avatar').send({ data: 'data:text/html;base64,PGI+aGk8L2I+' })).status, 400);
  assert.equal((await noa.put('/api/users/me/avatar').send({ data: 'data:image/gif;base64,R0lGODlh' })).status, 400);
  // Declared JPEG but PNG bytes.
  assert.equal((await noa.put('/api/users/me/avatar').send({ data: `data:image/jpeg;base64,${PNG_B64}` })).status, 400);
  // PNG signature followed by 260 KB of padding.
  const big = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(260 * 1024)]);
  const tooBig = await noa.put('/api/users/me/avatar').send({ data: `data:image/png;base64,${big.toString('base64')}` });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.body.error, /too large/);
});

test('only the owner or an admin can remove a photo', async () => {
  assert.equal((await orit.delete(`/api/users/${users.noa}/avatar`)).status, 403);

  const own = await noa.delete('/api/users/me/avatar');
  assert.equal(own.status, 200);
  assert.equal(own.body.user.avatar_v, null);
  assert.equal((await noa.get(`/api/users/${users.noa}/avatar`)).status, 404);

  await noa.put('/api/users/me/avatar').send({ data: PNG_URL });
  const byAdmin = await admin.delete(`/api/users/${users.noa}/avatar`);
  assert.equal(byAdmin.status, 200);
  assert.equal(byAdmin.body.user.avatar_v, null);
  assert.equal((await admin.delete('/api/users/99999/avatar')).status, 404);
});

test('deleting a user removes their photo', async () => {
  const created = await admin.post('/api/users').send({ username: 'pic', display_name: 'Pic', password: 'pic-pass-1', color: '#222222' });
  const pic = await loginAs(app, 'pic', 'pic-pass-1');
  await pic.put('/api/users/me/avatar').send({ data: PNG_URL });
  assert.equal((await noa.get(`/api/users/${created.body.user.id}/avatar`)).status, 200);
  await admin.delete(`/api/users/${created.body.user.id}`);
  assert.equal((await noa.get(`/api/users/${created.body.user.id}/avatar`)).status, 404);
});

function binaryParser(res, cb) {
  const chunks = [];
  res.on('data', (c) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}
