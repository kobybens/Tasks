import request from 'supertest';
import { createDb, runMigrations } from '../server/db.js';
import { createApp } from '../server/index.js';
import { createUser } from '../server/auth.js';

export const PW = 'secret1';

/** Fresh in-memory app with three seeded users: admin, noa, orit. */
export async function makeApp() {
  const db = createDb('file::memory:');
  await runMigrations(db);
  const app = createApp({ db, sessionSecret: 'test-secret', loginLimit: 1000 });
  const users = {};
  for (const [username, display_name, is_admin, color] of [
    ['admin', 'Admin', true, '#111111'],
    ['noa', 'Noa', false, '#ff0000'],
    ['orit', 'Orit', false, '#00ff00'],
  ]) {
    const row = await createUser(db, { username, display_name, password: PW, is_admin, color });
    users[username] = Number(row.id);
  }
  return { app, db, users };
}

/** A supertest agent that is logged in as `username` (cookie jar kept). */
export async function loginAs(app, username, password = PW) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status} ${res.text}`);
  return agent;
}
