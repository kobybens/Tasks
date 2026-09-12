import { Router } from 'express';
import { all, one, run } from '../db.js';
import { addDays, isIsoDate, isIsoDateTime } from '../lib/dates.js';

export default function carRoutes(db) {
  const r = Router();

  r.get('/', async (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
        return res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from <= to' });
      }
      const rows = await all(
        db,
        `${SELECT} WHERE b.start_at < ? AND b.end_at > ? ORDER BY b.start_at`,
        [`${addDays(to, 1)}T00:00`, `${from}T00:00`],
      );
      res.json({ bookings: rows.map(shape) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const v = await validateBooking(db, req.body ?? {}, req.user.id);
      if (v.error) return res.status(400).json({ error: v.error });
      const b = v.booking;
      const { rowsAffected, lastInsertRowid } = await run(
        db,
        `INSERT INTO car_bookings (user_id, start_at, end_at, note)
         SELECT ?, ?, ?, ?
          WHERE NOT EXISTS (${OVERLAP_EXISTS})`,
        [b.user_id, b.start_at, b.end_at, b.note, b.end_at, b.start_at, -1],
      );
      if (!rowsAffected) return res.status(409).json({ error: 'overlap', conflict: await findConflict(db, b, null) });
      res.status(201).json({ booking: await loadBooking(db, lastInsertRowid) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await one(db, 'SELECT * FROM car_bookings WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ error: 'Booking not found' });
      const merged = { ...existing, ...(req.body ?? {}) };
      const v = await validateBooking(db, merged, Number(existing.user_id));
      if (v.error) return res.status(400).json({ error: v.error });
      const b = v.booking;
      const { rowsAffected } = await run(
        db,
        `UPDATE car_bookings SET user_id = ?, start_at = ?, end_at = ?, note = ?
          WHERE id = ? AND NOT EXISTS (${OVERLAP_EXISTS})`,
        [b.user_id, b.start_at, b.end_at, b.note, id, b.end_at, b.start_at, id],
      );
      if (!rowsAffected) return res.status(409).json({ error: 'overlap', conflict: await findConflict(db, b, id) });
      res.json({ booking: await loadBooking(db, id) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const { rowsAffected } = await run(db, 'DELETE FROM car_bookings WHERE id = ?', [Number(req.params.id)]);
      if (!rowsAffected) return res.status(404).json({ error: 'Booking not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

const SELECT = `SELECT b.id, b.user_id, b.start_at, b.end_at, b.note, u.display_name AS driver_name, u.color AS driver_color
                  FROM car_bookings b JOIN users u ON u.id = b.user_id`;

function shape(row) {
  return {
    id: Number(row.id),
    user_id: Number(row.user_id),
    start_at: row.start_at,
    end_at: row.end_at,
    note: row.note ?? null,
    driver: { id: Number(row.user_id), display_name: row.driver_name, color: row.driver_color },
  };
}

async function loadBooking(db, id) {
  const row = await one(db, `${SELECT} WHERE b.id = ?`, [id]);
  return row ? shape(row) : undefined;
}

async function validateBooking(db, body, defaultUserId) {
  const { start_at, end_at } = body;
  if (!isIsoDateTime(start_at) || !isIsoDateTime(end_at)) return { error: 'Start and end must be YYYY-MM-DDTHH:MM' };
  if (end_at <= start_at) return { error: 'End must be after start' };
  const user_id = body.user_id == null ? defaultUserId : Number(body.user_id);
  if (!Number.isInteger(user_id)) return { error: 'Driver is required' };
  if (!(await one(db, 'SELECT id FROM users WHERE id = ?', [user_id]))) return { error: 'Driver does not exist' };
  const note = body.note == null || body.note === '' ? null : String(body.note).slice(0, 200);
  return { booking: { user_id, start_at, end_at, note } };
}

/** Subquery: another booking overlaps [start, end). Args: end_at, start_at, excludeId. */
const OVERLAP_EXISTS = `SELECT 1 FROM car_bookings o WHERE o.start_at < ? AND o.end_at > ? AND o.id != ?`;

/** The earliest booking that overlaps `b` (excluding `excludeId`), shaped for a 409 response. */
async function findConflict(db, b, excludeId) {
  const c = await one(
    db,
    `SELECT b.id, b.start_at, b.end_at, u.display_name AS driver
       FROM car_bookings b JOIN users u ON u.id = b.user_id
      WHERE b.start_at < ? AND b.end_at > ? AND b.id != ?
      ORDER BY b.start_at LIMIT 1`,
    [b.end_at, b.start_at, excludeId ?? -1],
  );
  return c ? { id: Number(c.id), start_at: c.start_at, end_at: c.end_at, driver: c.driver } : null;
}
