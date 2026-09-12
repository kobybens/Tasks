import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, loginAs } from './helpers.js';

let app, users, noa, orit, admin;
before(async () => {
  ({ app, users } = await makeApp());
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
  admin = await loginAs(app, 'admin');
});

const WEEK = 'from=2026-09-13&to=2026-09-19';

test('create a booking for self; list shows driver', async () => {
  const res = await noa.post('/api/car').send({ start_at: '2026-09-14T16:00', end_at: '2026-09-14T20:00', note: 'Gym' });
  assert.equal(res.status, 201);
  assert.equal(res.body.booking.user_id, users.noa);
  assert.equal(res.body.booking.driver.display_name, 'Noa');
  assert.equal(res.body.booking.note, 'Gym');

  const list = await orit.get(`/api/car?${WEEK}`);
  assert.equal(list.status, 200);
  assert.equal(list.body.bookings.length, 1);
  assert.equal(list.body.bookings[0].driver.color, '#ff0000');
});

test('overlapping booking is rejected with the conflicting driver', async () => {
  const res = await orit.post('/api/car').send({ start_at: '2026-09-14T18:00', end_at: '2026-09-14T19:00' });
  assert.equal(res.status, 409);
  assert.equal(res.body.error, 'overlap');
  assert.equal(res.body.conflict.driver, 'Noa');
  assert.equal(res.body.conflict.start_at, '2026-09-14T16:00');
  assert.equal(res.body.conflict.end_at, '2026-09-14T20:00');

  // partial overlaps on both sides
  assert.equal((await orit.post('/api/car').send({ start_at: '2026-09-14T15:00', end_at: '2026-09-14T16:30' })).status, 409);
  assert.equal((await orit.post('/api/car').send({ start_at: '2026-09-14T19:30', end_at: '2026-09-14T21:00' })).status, 409);
  // fully enclosing
  assert.equal((await orit.post('/api/car').send({ start_at: '2026-09-14T10:00', end_at: '2026-09-14T23:00' })).status, 409);
});

test('adjacent bookings are allowed (end == start)', async () => {
  assert.equal((await orit.post('/api/car').send({ start_at: '2026-09-14T20:00', end_at: '2026-09-14T21:00' })).status, 201);
  assert.equal((await orit.post('/api/car').send({ start_at: '2026-09-14T15:00', end_at: '2026-09-14T16:00' })).status, 201);
  const list = await noa.get('/api/car?from=2026-09-14&to=2026-09-14');
  assert.deepEqual(list.body.bookings.map((b) => b.start_at), ['2026-09-14T15:00', '2026-09-14T16:00', '2026-09-14T20:00']);
});

test('validation: bad times, end before start, unknown driver', async () => {
  assert.equal((await noa.post('/api/car').send({ start_at: '2026-09-15 10:00', end_at: '2026-09-15T11:00' })).status, 400);
  assert.equal((await noa.post('/api/car').send({ start_at: '2026-09-15T11:00', end_at: '2026-09-15T10:00' })).status, 400);
  assert.equal((await noa.post('/api/car').send({ start_at: '2026-09-15T10:00', end_at: '2026-09-15T10:00' })).status, 400);
  assert.equal((await noa.post('/api/car').send({ start_at: '2026-09-15T10:00', end_at: '2026-09-15T11:00', user_id: 9999 })).status, 400);
  assert.equal((await noa.get('/api/car?from=x&to=y')).status, 400);
});

test('booking for another driver, then editing it excludes itself from the overlap check', async () => {
  const res = await admin.post('/api/car').send({ start_at: '2026-09-16T08:00', end_at: '2026-09-16T09:00', user_id: users.orit });
  assert.equal(res.status, 201);
  assert.equal(res.body.booking.driver.display_name, 'Orit');
  const id = res.body.booking.id;

  // extend the same booking: must not conflict with itself
  const ext = await noa.patch(`/api/car/${id}`).send({ end_at: '2026-09-16T10:00' });
  assert.equal(ext.status, 200);
  assert.equal(ext.body.booking.end_at, '2026-09-16T10:00');
  assert.equal(ext.body.booking.user_id, users.orit);

  // move it onto Noa's Monday slot: conflict
  const clash = await noa.patch(`/api/car/${id}`).send({ start_at: '2026-09-14T17:00', end_at: '2026-09-14T18:00' });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.conflict.driver, 'Noa');

  assert.equal((await noa.patch('/api/car/99999').send({ note: 'x' })).status, 404);
  assert.equal((await orit.delete(`/api/car/${id}`)).status, 200);
  assert.equal((await orit.delete(`/api/car/${id}`)).status, 404);
});

test('range query includes bookings that cross midnight into the range', async () => {
  assert.equal((await noa.post('/api/car').send({ start_at: '2026-09-12T22:00', end_at: '2026-09-13T01:00' })).status, 201);
  const inRange = await noa.get('/api/car?from=2026-09-13&to=2026-09-13');
  assert.equal(inRange.body.bookings.length, 1);
  const before = await noa.get('/api/car?from=2026-09-11&to=2026-09-11');
  assert.equal(before.body.bookings.length, 0);
});
