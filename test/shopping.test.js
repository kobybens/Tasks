import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, loginAs } from './helpers.js';

let app, noa, orit;
before(async () => {
  ({ app } = await makeApp());
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
});

test('requires login', async () => {
  assert.equal((await request(app).get('/api/shopping')).status, 401);
  assert.equal((await request(app).post('/api/shopping').send({ text: 'Milk' })).status, 401);
});

test('add items, validation, and list order (unticked first, oldest first)', async () => {
  assert.equal((await noa.post('/api/shopping').send({ text: '   ' })).status, 400);
  assert.equal((await noa.post('/api/shopping').send({})).status, 400);
  assert.equal((await noa.post('/api/shopping').send({ text: 'x'.repeat(201) })).status, 400);

  const a = await noa.post('/api/shopping').send({ text: '  Milk   2L ' });
  assert.equal(a.status, 201);
  assert.equal(a.body.item.text, 'Milk 2L');
  assert.equal(a.body.item.done, false);
  const b = await orit.post('/api/shopping').send({ text: 'Bread' });
  const c = await orit.post('/api/shopping').send({ text: 'Eggs' });
  assert.equal(b.status, 201);
  assert.equal(c.status, 201);

  const list = await noa.get('/api/shopping');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.items.map((i) => i.text),
    ['Milk 2L', 'Bread', 'Eggs'],
  );
});

test('tick and untick, edit text, ticked items sink to the bottom', async () => {
  const items = (await noa.get('/api/shopping')).body.items;
  const milk = items.find((i) => i.text === 'Milk 2L');

  const ticked = await orit.patch(`/api/shopping/${milk.id}`).send({ done: true });
  assert.equal(ticked.status, 200);
  assert.equal(ticked.body.item.done, true);

  let list = (await noa.get('/api/shopping')).body.items;
  assert.equal(list[list.length - 1].text, 'Milk 2L');

  const renamed = await noa.patch(`/api/shopping/${milk.id}`).send({ text: 'Oat milk', done: false });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.item.text, 'Oat milk');
  assert.equal(renamed.body.item.done, false);
  list = (await noa.get('/api/shopping')).body.items;
  assert.equal(list[0].text, 'Oat milk');

  assert.equal((await noa.patch(`/api/shopping/${milk.id}`).send({ text: '' })).status, 400);
  assert.equal((await noa.patch('/api/shopping/99999').send({ done: true })).status, 404);
});

test('clear bought removes only ticked items', async () => {
  const items = (await noa.get('/api/shopping')).body.items;
  const bread = items.find((i) => i.text === 'Bread');
  const eggs = items.find((i) => i.text === 'Eggs');
  await noa.patch(`/api/shopping/${bread.id}`).send({ done: true });
  await noa.patch(`/api/shopping/${eggs.id}`).send({ done: true });

  const cleared = await orit.delete('/api/shopping/done');
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.removed, 2);

  const list = (await noa.get('/api/shopping')).body.items;
  assert.deepEqual(
    list.map((i) => i.text),
    ['Oat milk'],
  );

  const again = await orit.delete('/api/shopping/done');
  assert.equal(again.body.removed, 0);
});

test('delete one item', async () => {
  const [item] = (await noa.get('/api/shopping')).body.items;
  assert.equal((await orit.delete(`/api/shopping/${item.id}`)).status, 200);
  assert.equal((await orit.delete(`/api/shopping/${item.id}`)).status, 404);
  assert.equal((await noa.get('/api/shopping')).body.items.length, 0);
});

test('quantity defaults to 1, can be set and changed, and is validated', async () => {
  const one = await noa.post('/api/shopping').send({ text: 'Butter' });
  assert.equal(one.body.item.qty, 1);
  const three = await noa.post('/api/shopping').send({ text: 'Milk', qty: 3 });
  assert.equal(three.status, 201);
  assert.equal(three.body.item.qty, 3);
  assert.equal((await noa.post('/api/shopping').send({ text: 'Bad', qty: 0 })).status, 400);
  assert.equal((await noa.post('/api/shopping').send({ text: 'Bad', qty: 2.5 })).status, 400);
  assert.equal((await noa.post('/api/shopping').send({ text: 'Bad', qty: 1000 })).status, 400);
  assert.equal((await noa.post('/api/shopping').send({ text: 'Bad', qty: 'lots' })).status, 400);

  const bumped = await orit.patch(`/api/shopping/${three.body.item.id}`).send({ qty: 4 });
  assert.equal(bumped.body.item.qty, 4);
  assert.equal(bumped.body.item.text, 'Milk');
  const ticked = await orit.patch(`/api/shopping/${three.body.item.id}`).send({ done: true });
  assert.equal(ticked.body.item.qty, 4, 'ticking keeps the quantity');
  assert.equal((await orit.patch(`/api/shopping/${three.body.item.id}`).send({ qty: -1 })).status, 400);
});
