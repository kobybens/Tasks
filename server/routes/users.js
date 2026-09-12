import { Router } from 'express';
import { all, one, run } from '../db.js';
import {
  createUser,
  hashPassword,
  isValidColor,
  isValidPassword,
  isValidUsername,
  publicUser,
  requireAdmin,
} from '../auth.js';

export default function userRoutes(db) {
  const r = Router();

  // Every logged-in user needs the list to pick an assignee or driver.
  r.get('/', async (_req, res, next) => {
    try {
      const rows = await all(db, 'SELECT * FROM users ORDER BY lower(display_name)');
      res.json({ users: rows.map(publicUser) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', requireAdmin, async (req, res, next) => {
    try {
      const { username, display_name, password, color, is_admin } = req.body ?? {};
      if (!isValidUsername(username)) return res.status(400).json({ error: 'Username: 2-32 letters, digits, . _ -' });
      if (typeof display_name !== 'string' || !display_name.trim()) return res.status(400).json({ error: 'Display name is required' });
      if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 4 characters' });
      if (!isValidColor(color)) return res.status(400).json({ error: 'Color must be a hex value like #3b82f6' });
      if (await one(db, 'SELECT id FROM users WHERE lower(username) = lower(?)', [username])) {
        return res.status(409).json({ error: 'Username already taken' });
      }
      const row = await createUser(db, {
        username,
        display_name: display_name.trim(),
        password,
        color,
        is_admin: Boolean(is_admin),
      });
      res.status(201).json({ user: publicUser(row) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const row = await one(db, 'SELECT * FROM users WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ error: 'User not found' });
      const { display_name, color, is_admin, password } = req.body ?? {};
      const sets = [];
      const args = [];
      if (display_name !== undefined) {
        if (typeof display_name !== 'string' || !display_name.trim()) return res.status(400).json({ error: 'Display name is required' });
        sets.push('display_name = ?');
        args.push(display_name.trim());
      }
      if (color !== undefined) {
        if (!isValidColor(color)) return res.status(400).json({ error: 'Color must be a hex value like #3b82f6' });
        sets.push('color = ?');
        args.push(color);
      }
      if (is_admin !== undefined) {
        if (!is_admin && row.is_admin && (await adminCount(db)) <= 1) {
          return res.status(400).json({ error: 'Cannot remove the last admin' });
        }
        sets.push('is_admin = ?');
        args.push(is_admin ? 1 : 0);
      }
      if (password !== undefined) {
        if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 4 characters' });
        sets.push('password_hash = ?');
        args.push(await hashPassword(password));
      }
      if (sets.length) await run(db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, id]);
      res.json({ user: publicUser(await one(db, 'SELECT * FROM users WHERE id = ?', [id])) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself' });
      const row = await one(db, 'SELECT * FROM users WHERE id = ?', [id]);
      if (!row) return res.status(404).json({ error: 'User not found' });
      if (row.is_admin && (await adminCount(db)) <= 1) return res.status(400).json({ error: 'Cannot delete the last admin' });
      await run(db, 'DELETE FROM users WHERE id = ?', [id]);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function adminCount(db) {
  const { c } = await one(db, 'SELECT COUNT(*) AS c FROM users WHERE is_admin = 1');
  return Number(c);
}
