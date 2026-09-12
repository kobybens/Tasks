import { Router } from 'express';
import { one, run } from '../db.js';
import { hashPassword, isValidPassword, publicUser, requireAuth, verifyPassword } from '../auth.js';

export default function authRoutes(db, loginRateLimit) {
  const r = Router();

  r.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const row = await one(db, 'SELECT * FROM users WHERE lower(username) = lower(?)', [username.trim()]);
      const ok = row && (await verifyPassword(password, row.password_hash));
      if (!ok) return res.status(401).json({ error: 'Wrong username or password' });
      req.session.userId = Number(row.id);
      res.json({ user: publicUser(row) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/logout', (req, res) => {
    req.session = null;
    res.json({ ok: true });
  });

  r.get('/me', requireAuth(db), (req, res) => res.json({ user: req.user }));

  r.patch('/password', requireAuth(db), async (req, res, next) => {
    try {
      const { current, next: nextPw } = req.body ?? {};
      if (!isValidPassword(nextPw)) return res.status(400).json({ error: 'New password must be at least 4 characters' });
      const row = await one(db, 'SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
      if (!(await verifyPassword(String(current ?? ''), row.password_hash))) {
        return res.status(400).json({ error: 'Current password is wrong' });
      }
      await run(db, 'UPDATE users SET password_hash = ? WHERE id = ?', [await hashPassword(nextPw), req.user.id]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}
