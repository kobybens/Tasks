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
  USER_SELECT,
} from '../auth.js';

const MAX_AVATAR_BYTES = 250 * 1024;
const AVATAR_MAGIC = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
};

export default function userRoutes(db) {
  const r = Router();

  // Every logged-in user needs the list to pick an assignee or driver.
  r.get('/', async (_req, res, next) => {
    try {
      const rows = await all(db, `${USER_SELECT} ORDER BY lower(u.display_name)`);
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
      if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
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

  /* ---------- avatars ---------- */

  r.get('/:id/avatar', async (req, res, next) => {
    try {
      const row = await one(db, 'SELECT mime, data FROM user_avatars WHERE user_id = ?', [Number(req.params.id)]);
      if (!row) return res.status(404).json({ error: 'No photo' });
      // The URL carries a version query, so the file can be cached for good.
      res.set('Content-Type', row.mime);
      res.set('Cache-Control', 'private, max-age=31536000, immutable');
      res.send(Buffer.from(row.data));
    } catch (err) {
      next(err);
    }
  });

  r.put('/me/avatar', async (req, res, next) => {
    try {
      const parsed = parseImageDataUrl(req.body?.data);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      await run(
        db,
        `INSERT INTO user_avatars (user_id, mime, data, updated_at) VALUES (?, ?, ?, now())
         ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data = EXCLUDED.data, updated_at = now()`,
        [req.user.id, parsed.mime, parsed.bytes],
      );
      res.json({ user: publicUser(await one(db, `${USER_SELECT} WHERE u.id = ?`, [req.user.id])) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/me/avatar', async (req, res, next) => {
    try {
      await run(db, 'DELETE FROM user_avatars WHERE user_id = ?', [req.user.id]);
      res.json({ user: publicUser(await one(db, `${USER_SELECT} WHERE u.id = ?`, [req.user.id])) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id/avatar', requireAdmin, async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!(await one(db, 'SELECT id FROM users WHERE id = ?', [id]))) return res.status(404).json({ error: 'User not found' });
      await run(db, 'DELETE FROM user_avatars WHERE user_id = ?', [id]);
      res.json({ user: publicUser(await one(db, `${USER_SELECT} WHERE u.id = ?`, [id])) });
    } catch (err) {
      next(err);
    }
  });

  /* ---------- members ---------- */

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
        if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
        sets.push('password_hash = ?');
        args.push(await hashPassword(password));
      }
      if (sets.length) await run(db, `UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...args, id]);
      res.json({ user: publicUser(await one(db, `${USER_SELECT} WHERE u.id = ?`, [id])) });
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

/**
 * Accept only `data:image/(jpeg|png|webp);base64,...` whose bytes really carry that format's
 * signature and stay under the size cap. Returns { mime, bytes } or { error }.
 */
function parseImageDataUrl(data) {
  if (typeof data !== 'string') return { error: 'Photo data is required' };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/.exec(data);
  if (!m) return { error: 'Photo must be a JPEG, PNG or WebP image' };
  const mime = m[1];
  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) return { error: 'Photo is empty' };
  if (bytes.length > MAX_AVATAR_BYTES) return { error: 'Photo is too large (max 250 KB)' };
  const magic = AVATAR_MAGIC[mime];
  if (!magic.every((b, i) => bytes[i] === b)) return { error: 'Photo data does not match its type' };
  if (mime === 'image/webp' && bytes.subarray(8, 12).toString('ascii') !== 'WEBP') return { error: 'Photo data does not match its type' };
  return { mime, bytes };
}
