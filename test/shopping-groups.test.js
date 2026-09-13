import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, loginAs } from './helpers.js';

let app, noa, orit, other;
before(async () => {
  ({ app } = await makeApp());
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
});

test('default groups are seeded with Other last, and require login', async () => {
  assert.equal((await request(app).get('/api/shopping/groups')).status, 401);
  const res = await noa.get('/api/shopping/groups');
  assert.equal(res.status, 200);
  const names = res.body.groups.map((g) => g.name);
  assert.equal(names.length, 9);
  assert.equal(names[0], 'Vegetables & fruit');
  assert.equal(names[names.length - 1], 'Other');
  other = res.body.groups.find((g) => g.is_default);
  assert.equal(other.name, 'Other');
  assert.equal(res.body.groups.filter((g) => g.is_default).length, 1);
});

test('items default to Other and can be added to a chosen group', async () => {
  const groups = (await noa.get('/api/shopping/groups')).body.groups;
  const veg = groups.find((g) => g.name === 'Vegetables & fruit');

  const a = await noa.post('/api/shopping').send({ text: 'Toothpaste' });
  assert.equal(a.status, 201);
  assert.equal(a.body.item.group_id, other.id);

  const b = await orit.post('/api/shopping').send({ text: 'Tomatoes', group_id: veg.id });
  assert.equal(b.status, 201);
  assert.equal(b.body.item.group_id, veg.id);

  assert.equal((await noa.post('/api/shopping').send({ text: 'Ghost', group_id: 99999 })).status, 400);
  assert.equal((await noa.post('/api/shopping').send({ text: 'Ghost', group_id: 'abc' })).status, 400);

  const list = await noa.get('/api/shopping');
  assert.equal(list.body.groups.length, 9);
  assert.equal(list.body.items.find((i) => i.text === 'Tomatoes').group_id, veg.id);
});

test('create, rename and reject duplicate groups', async () => {
  assert.equal((await noa.post('/api/shopping/groups').send({ name: '  ' })).status, 400);
  assert.equal((await noa.post('/api/shopping/groups').send({ name: 'x'.repeat(41) })).status, 400);
  assert.equal((await noa.post('/api/shopping/groups').send({ name: 'pantry' })).status, 409);

  const created = await orit.post('/api/shopping/groups').send({ name: ' Baby  stuff ' });
  assert.equal(created.status, 201);
  assert.equal(created.body.group.name, 'Baby stuff');
  assert.equal(created.body.group.is_default, false);

  const names = (await noa.get('/api/shopping/groups')).body.groups.map((g) => g.name);
  assert.equal(names[names.length - 1], 'Other', 'Other stays last after adding a group');
  assert.equal(names[names.length - 2], 'Baby stuff');

  const renamed = await noa.patch(`/api/shopping/groups/${created.body.group.id}`).send({ name: 'Baby' });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.group.name, 'Baby');
  assert.equal((await noa.patch(`/api/shopping/groups/${created.body.group.id}`).send({ name: 'Frozen' })).status, 409);
  assert.equal((await noa.patch('/api/shopping/groups/99999').send({ name: 'Nope' })).status, 404);
});

test('moving an item between groups', async () => {
  const groups = (await noa.get('/api/shopping/groups')).body.groups;
  const dairy = groups.find((g) => g.name === 'Dairy & eggs');
  const item = (await noa.get('/api/shopping')).body.items.find((i) => i.text === 'Toothpaste');
  const moved = await noa.patch(`/api/shopping/${item.id}`).send({ group_id: dairy.id });
  assert.equal(moved.status, 200);
  assert.equal(moved.body.item.group_id, dairy.id);
  assert.equal(moved.body.item.text, 'Toothpaste');
  assert.equal((await noa.patch(`/api/shopping/${item.id}`).send({ group_id: 99999 })).status, 400);
});

test('deleting a group moves its items to Other; Other cannot be deleted', async () => {
  const groups = (await noa.get('/api/shopping/groups')).body.groups;
  const veg = groups.find((g) => g.name === 'Vegetables & fruit');
  await noa.post('/api/shopping').send({ text: 'Cucumbers', group_id: veg.id });

  const del = await orit.delete(`/api/shopping/groups/${veg.id}`);
  assert.equal(del.status, 200);
  assert.equal(del.body.moved, 2);

  const items = (await noa.get('/api/shopping')).body.items;
  for (const text of ['Tomatoes', 'Cucumbers']) {
    assert.equal(items.find((i) => i.text === text).group_id, other.id, `${text} moved to Other`);
  }
  assert.equal((await noa.get('/api/shopping/groups')).body.groups.length, 9);
  assert.equal((await noa.delete(`/api/shopping/groups/${veg.id}`)).status, 404);

  const protectedDel = await noa.delete(`/api/shopping/groups/${other.id}`);
  assert.equal(protectedDel.status, 400);
});
