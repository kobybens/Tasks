import { Router } from 'express';
import { all, one, run } from '../db.js';

const MAX_TEXT = 200;

export default function shoppingRoutes(db) {
  const r = Router();

  r.get('/', async (_req, res, next) => {
    try {
      const rows = await all(db, 'SELECT * FROM shopping_items ORDER BY done ASC, created_at ASC, id ASC');
      res.json({ items: rows.map(shape) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const text = cleanText(req.body?.text);
      if (!text) return res.status(400).json({ error: `Item text is required (max ${MAX_TEXT} characters)` });
      const { rows } = await run(db, 'INSERT INTO shopping_items (text, created_by) VALUES (?, ?) RETURNING id', [text, req.user.id]);
      res.status(201).json({ item: shape(await one(db, 'SELECT * FROM shopping_items WHERE id = ?', [rows[0].id])) });
    } catch (err) {
      next(err);
    }
  });

  // Must come before /:id so "done" is not parsed as an id.
  r.delete('/done', async (_req, res, next) => {
    try {
      const { rowsAffected } = await run(db, 'DELETE FROM shopping_items WHERE done = 1');
      res.json({ ok: true, removed: rowsAffected });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await one(db, 'SELECT * FROM shopping_items WHERE id = ?', [id]);
      if (!existing) return res.status(404).json({ error: 'Item not found' });
      const { text, done } = req.body ?? {};
      let nextText = existing.text;
      if (text !== undefined) {
        nextText = cleanText(text);
        if (!nextText) return res.status(400).json({ error: `Item text is required (max ${MAX_TEXT} characters)` });
      }
      const nextDone = done === undefined ? Number(existing.done) : done ? 1 : 0;
      await run(db, 'UPDATE shopping_items SET text = ?, done = ? WHERE id = ?', [nextText, nextDone, id]);
      res.json({ item: shape(await one(db, 'SELECT * FROM shopping_items WHERE id = ?', [id])) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const { rowsAffected } = await run(db, 'DELETE FROM shopping_items WHERE id = ?', [Number(req.params.id)]);
      if (!rowsAffected) return res.status(404).json({ error: 'Item not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

function cleanText(v) {
  if (typeof v !== 'string') return '';
  const t = v.trim().replace(/\s+/g, ' ');
  return t.length > MAX_TEXT ? '' : t;
}

function shape(row) {
  return {
    id: Number(row.id),
    text: row.text,
    done: Boolean(Number(row.done)),
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: toIso(row.created_at),
  };
}

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v;
}
