import { Router } from 'express';
import { one, run } from '../db.js';
import { hashPassword, isValidColor, isValidPassword, publicUser, requireAuth, USER_SELECT, verifyPassword } from '../auth.js';

export default function authRoutes(db, loginRateLimit, failures) {
  const r = Router();

  r.post('/login', loginRateLimit, async (req, res, next) => {
    try {
      const { username, password } = req.body ?? {};
      if (typeof username !== 'string' || typeof password !== 'string') {
        return res.status(400).json({ error: 'Username and password are required' });
      }
      const key = username.trim().toLowerCase();
      if (failures.isLocked(key)) {
        console.warn(`Login locked for "${key}" from ${req.ip}`);
        return res.status(429).json({ error: `Too many failed attempts for this user. Try again in ${failures.minutes} minutes.` });
      }
      const row = await one(db, `${USER_SELECT} WHERE lower(u.username) = lower(?)`, [username.trim()]);
      const ok = row && (await verifyPassword(password, row.password_hash));
      if (!ok) {
        failures.fail(key);
        console.warn(`Failed login for "${key}" from ${req.ip}`);
        return res.status(401).json({ error: 'Wrong username or password' });
      }
      failures.clear(key);
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

  r.patch('/me', requireAuth(db), async (req, res, next) => {
    try {
      const { display_name, color } = req.body ?? {};
      const sets = [];
      const args = [];
      if (display_name !== undefined) {
        const name = typeof display_name === 'string' ? display_name.trim() : '';
        if (!name || name.length > 40) return res.status(400).json({ error: 'Name is required (max 40 characters)' });
        sets.push('display_name = ?');
        args.push(name);
      }
      if (color !== undefined) {
        if (!isValidColor(color)) return res.status(400).json({ error: 'Color must be a hex value like #3b82f6' });
        sets.push('color = ?');
        args.push(color);
      }
      if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
      await run(db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, req.user.id]);
      res.json({ user: publicUser(await one(db, `${USER_SELECT} WHERE u.id = ?`, [req.user.id])) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/password', requireAuth(db), async (req, res, next) => {
    try {
      const { current, next: nextPw } = req.body ?? {};
      if (!isValidPassword(nextPw)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
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
