import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { makeApp, loginAs } from './helpers.js';

let app, users, admin, noa, orit;
before(async () => {
  ({ app, users } = await makeApp());
  admin = await loginAs(app, 'admin');
  noa = await loginAs(app, 'noa');
  orit = await loginAs(app, 'orit');
});

test('requires login', async () => {
  assert.equal((await request(app).get('/api/notes')).status, 401);
});

test('add notes with author, newest first', async () => {
  assert.equal((await noa.post('/api/notes').send({ text: '  ' })).status, 400);
  assert.equal((await noa.post('/api/notes').send({ text: 'x'.repeat(2001) })).status, 400);

  const first = await noa.post('/api/notes').send({ text: 'Plumber comes Tuesday 10:00' });
  assert.equal(first.status, 201);
  assert.equal(first.body.note.author.display_name, 'Noa');
  assert.equal(first.body.note.author.color, '#ff0000');
  assert.equal(first.body.note.edited_by, null);
  assert.ok(first.body.note.created_at);

  const second = await orit.post('/api/notes').send({ text: 'Wifi password: family2026' });
  assert.equal(second.status, 201);

  const list = await noa.get('/api/notes');
  assert.equal(list.status, 200);
  assert.deepEqual(
    list.body.notes.map((n) => n.author.display_name),
    ['Orit', 'Noa'],
  );
});

test('anyone can edit a note; editor is recorded when different from the author', async () => {
  const noaNote = (await noa.get('/api/notes')).body.notes.find((n) => n.author.display_name === 'Noa');
  const edited = await orit.patch(`/api/notes/${noaNote.id}`).send({ text: 'Plumber comes Tuesday 11:00' });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.note.text, 'Plumber comes Tuesday 11:00');
  assert.equal(edited.body.note.author.display_name, 'Noa');
  assert.equal(edited.body.note.edited_by, 'Orit');
  assert.ok(edited.body.note.updated_at >= edited.body.note.created_at);

  const selfEdit = await noa.patch(`/api/notes/${noaNote.id}`).send({ text: 'Plumber comes Tuesday 11:30' });
  assert.equal(selfEdit.body.note.edited_by, null);

  assert.equal((await orit.patch(`/api/notes/${noaNote.id}`).send({ text: '' })).status, 400);
  assert.equal((await orit.patch('/api/notes/99999').send({ text: 'x' })).status, 404);
});

test('a note survives its author being deleted', async () => {
  const created = await admin.post('/api/users').send({ username: 'temp', display_name: 'Temp', password: 'temp123', color: '#222222' });
  const temp = await loginAs(app, 'temp', 'temp123');
  const note = await temp.post('/api/notes').send({ text: 'Left by temp' });
  assert.equal(note.status, 201);
  assert.equal((await admin.delete(`/api/users/${created.body.user.id}`)).status, 200);

  const list = (await noa.get('/api/notes')).body.notes;
  const orphan = list.find((n) => n.text === 'Left by temp');
  assert.ok(orphan);
  assert.equal(orphan.author, null);
  void users;
});

test('delete a note', async () => {
  const [note] = (await noa.get('/api/notes')).body.notes;
  assert.equal((await orit.delete(`/api/notes/${note.id}`)).status, 200);
  assert.equal((await orit.delete(`/api/notes/${note.id}`)).status, 404);
});
