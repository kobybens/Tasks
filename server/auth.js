import bcrypt from 'bcryptjs';
import { one, run } from './db.js';

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function hashPassword(plain) {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

/** Shape of a user that is safe to send to the browser. */
export function publicUser(row) {
  return {
    id: Number(row.id),
    username: row.username,
    display_name: row.display_name,
    is_admin: Boolean(row.is_admin),
    color: row.color,
  };
}

export function isValidColor(c) {
  return typeof c === 'string' && COLOR.test(c);
}

export function isValidUsername(u) {
  return typeof u === 'string' && /^[a-zA-Z0-9_.-]{2,32}$/.test(u);
}

export function isValidPassword(p) {
  return typeof p === 'string' && p.length >= 4 && p.length <= 200;
}

export async function createUser(db, { username, display_name, password, is_admin = false, color }) {
  const password_hash = await hashPassword(password);
  const { rows } = await run(
    db,
    'INSERT INTO users (username, display_name, password_hash, is_admin, color) VALUES (?, ?, ?, ?, ?) RETURNING id',
    [username, display_name, password_hash, is_admin ? 1 : 0, color],
  );
  return one(db, 'SELECT * FROM users WHERE id = ?', [rows[0].id]);
}

/** Load the session user onto req.user, or answer 401. */
export function requireAuth(db) {
  return async (req, res, next) => {
    try {
      const id = req.session?.userId;
      if (!id) return res.status(401).json({ error: 'Not logged in' });
      const row = await one(db, 'SELECT * FROM users WHERE id = ?', [id]);
      if (!row) {
        req.session = null;
        return res.status(401).json({ error: 'Not logged in' });
      }
      req.user = publicUser(row);
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ error: 'Admin only' });
  next();
}

/**
 * On first start with an empty users table, create the admin from env vars.
 * Returns true if an admin was created.
 */
export async function bootstrapAdmin(db, env = process.env, log = console) {
  const { c } = await one(db, 'SELECT COUNT(*) AS c FROM users');
  if (Number(c) > 0) return false;
  const username = env.ADMIN_USERNAME;
  const password = env.ADMIN_PASSWORD;
  if (!username || !password) {
    log.warn('No users exist and ADMIN_USERNAME / ADMIN_PASSWORD are not set. Nobody can log in.');
    return false;
  }
  await createUser(db, { username, display_name: username, password, is_admin: true, color: '#3b82f6' });
  log.info(`Created initial admin user "${username}".`);
  return true;
}

/** Very small in-memory rate limiter: `max` attempts per `windowMs` per key. */
export function makeRateLimiter({ max = 10, windowMs = 60_000 } = {}) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const key = req.ip || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= max) return res.status(429).json({ error: 'Too many attempts, try again in a minute' });
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
