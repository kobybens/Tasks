import { Router } from 'express';
import { all, one, run } from '../db.js';

const MAX_TEXT = 2000;

const SELECT = `SELECT n.*, a.display_name AS author_name, a.color AS author_color, e.display_name AS editor_name
                  FROM notes n
                  LEFT JOIN users a ON a.id = n.created_by
                  LEFT JOIN users e ON e.id = n.updated_by`;

export default function notesRoutes(db) {
  const r = Router();

  r.get('/', async (_req, res, next) => {
    try {
      const rows = await all(db, `${SELECT} ORDER BY n.created_at DESC, n.id DESC`);
      res.json({ notes: rows.map(shape) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const text = cleanText(req.body?.text);
      if (!text) return res.status(400).json({ error: `Note text is required (max ${MAX_TEXT} characters)` });
      const { rows } = await run(db, 'INSERT INTO notes (text, created_by, updated_by) VALUES (?, ?, ?) RETURNING id', [
        text,
        req.user.id,
        req.user.id,
      ]);
      res.status(201).json({ note: await load(db, rows[0].id) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!(await one(db, 'SELECT id FROM notes WHERE id = ?', [id]))) return res.status(404).json({ error: 'Note not found' });
      const text = cleanText(req.body?.text);
      if (!text) return res.status(400).json({ error: `Note text is required (max ${MAX_TEXT} characters)` });
      await run(db, 'UPDATE notes SET text = ?, updated_by = ?, updated_at = now() WHERE id = ?', [text, req.user.id, id]);
      res.json({ note: await load(db, id) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const { rowsAffected } = await run(db, 'DELETE FROM notes WHERE id = ?', [Number(req.params.id)]);
      if (!rowsAffected) return res.status(404).json({ error: 'Note not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function load(db, id) {
  const row = await one(db, `${SELECT} WHERE n.id = ?`, [id]);
  return row ? shape(row) : undefined;
}

function cleanText(v) {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t.length > MAX_TEXT ? '' : t;
}

function shape(row) {
  return {
    id: Number(row.id),
    text: row.text,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    author: row.created_by == null ? null : { id: Number(row.created_by), display_name: row.author_name, color: row.author_color },
    edited_by: row.updated_by != null && Number(row.updated_by) !== Number(row.created_by) ? row.editor_name : null,
  };
}

function toIso(v) {
  return v instanceof Date ? v.toISOString() : v;
}
