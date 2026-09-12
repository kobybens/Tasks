import { Router } from 'express';
import { all, one, run } from '../db.js';
import { daysBetween, isIsoDate } from '../lib/dates.js';
import { expandTasks } from '../lib/recurrence.js';

const MAX_RANGE_DAYS = 62;

export default function taskRoutes(db) {
  const r = Router();

  r.get('/', async (req, res, next) => {
    try {
      const { from, to } = req.query;
      if (!isIsoDate(from) || !isIsoDate(to) || to < from) {
        return res.status(400).json({ error: 'from and to must be YYYY-MM-DD with from <= to' });
      }
      if (daysBetween(from, to) > MAX_RANGE_DAYS) return res.status(400).json({ error: `Range is limited to ${MAX_RANGE_DAYS} days` });
      const tasks = await all(
        db,
        `SELECT t.*, u.display_name AS assignee_name, u.color AS assignee_color
           FROM tasks t JOIN users u ON u.id = t.assignee_id
          WHERE (t.kind = 'once' AND t.date BETWEEN ? AND ?)
             OR (t.kind = 'weekly'
                 AND (t.start_date IS NULL OR t.start_date <= ?)
                 AND (t.end_date IS NULL OR t.end_date >= ?))`,
        [from, to, to, from],
      );
      const completions = await all(
        db,
        'SELECT task_id, date, completed_by FROM task_completions WHERE date BETWEEN ? AND ?',
        [from, to],
      );
      res.json({ occurrences: expandTasks(tasks.map(normalizeRow), completions.map(normalizeRow), from, to) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const v = await validateTask(db, req.body ?? {});
      if (v.error) return res.status(400).json({ error: v.error });
      const t = v.task;
      const { lastInsertRowid } = await run(
        db,
        `INSERT INTO tasks (title, notes, assignee_id, kind, date, weekday, start_date, end_date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.title, t.notes, t.assignee_id, t.kind, t.date, t.weekday, t.start_date, t.end_date, req.user.id],
      );
      res.status(201).json({ task: await loadTask(db, lastInsertRowid) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = await loadTask(db, id);
      if (!existing) return res.status(404).json({ error: 'Task not found' });
      const merged = { ...existing, ...(req.body ?? {}) };
      // Switching kind clears the fields that belong to the other kind unless the body supplies them.
      if (req.body?.kind && req.body.kind !== existing.kind) {
        if (merged.kind === 'once') Object.assign(merged, { weekday: req.body.weekday ?? null, start_date: req.body.start_date ?? null, end_date: req.body.end_date ?? null });
        else merged.date = req.body.date ?? null;
      }
      const v = await validateTask(db, merged);
      if (v.error) return res.status(400).json({ error: v.error });
      const t = v.task;
      await run(
        db,
        `UPDATE tasks SET title = ?, notes = ?, assignee_id = ?, kind = ?, date = ?, weekday = ?, start_date = ?, end_date = ?
          WHERE id = ?`,
        [t.title, t.notes, t.assignee_id, t.kind, t.date, t.weekday, t.start_date, t.end_date, id],
      );
      res.json({ task: await loadTask(db, id) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id', async (req, res, next) => {
    try {
      const { rowsAffected } = await run(db, 'DELETE FROM tasks WHERE id = ?', [Number(req.params.id)]);
      if (!rowsAffected) return res.status(404).json({ error: 'Task not found' });
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  r.put('/:id/done/:date', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const { date } = req.params;
      if (!isIsoDate(date)) return res.status(400).json({ error: 'Invalid date' });
      if (!(await one(db, 'SELECT id FROM tasks WHERE id = ?', [id]))) return res.status(404).json({ error: 'Task not found' });
      await run(
        db,
        `INSERT INTO task_completions (task_id, date, completed_by) VALUES (?, ?, ?)
         ON CONFLICT(task_id, date) DO NOTHING`,
        [id, date, req.user.id],
      );
      res.json({ ok: true, done: true });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/:id/done/:date', async (req, res, next) => {
    try {
      const { date } = req.params;
      if (!isIsoDate(date)) return res.status(400).json({ error: 'Invalid date' });
      await run(db, 'DELETE FROM task_completions WHERE task_id = ? AND date = ?', [Number(req.params.id), date]);
      res.json({ ok: true, done: false });
    } catch (err) {
      next(err);
    }
  });

  return r;
}

async function loadTask(db, id) {
  const row = await one(db, 'SELECT * FROM tasks WHERE id = ?', [id]);
  return row ? normalizeRow(row) : undefined;
}

/** libSQL returns integers as numbers or bigints depending on driver; coerce and drop nulls to null. */
function normalizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) out[k] = typeof v === 'bigint' ? Number(v) : v;
  return out;
}

/**
 * Validate a full task object. Returns { task } with clean values or { error }.
 */
async function validateTask(db, body) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!title || title.length > 200) return { error: 'Title is required (max 200 characters)' };
  const notes = body.notes == null || body.notes === '' ? null : String(body.notes).slice(0, 1000);
  const assignee_id = Number(body.assignee_id);
  if (!Number.isInteger(assignee_id)) return { error: 'Assignee is required' };
  if (!(await one(db, 'SELECT id FROM users WHERE id = ?', [assignee_id]))) return { error: 'Assignee does not exist' };

  const kind = body.kind;
  if (kind === 'once') {
    if (!isIsoDate(body.date)) return { error: 'A one-off task needs a valid date' };
    return { task: { title, notes, assignee_id, kind, date: body.date, weekday: null, start_date: null, end_date: null } };
  }
  if (kind === 'weekly') {
    const weekday = Number(body.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return { error: 'A weekly task needs a weekday (0 = Sunday .. 6 = Saturday)' };
    const start_date = body.start_date ? body.start_date : null;
    const end_date = body.end_date ? body.end_date : null;
    if (start_date && !isIsoDate(start_date)) return { error: 'Invalid start date' };
    if (end_date && !isIsoDate(end_date)) return { error: 'Invalid end date' };
    if (start_date && end_date && end_date < start_date) return { error: 'End date must be after start date' };
    return { task: { title, notes, assignee_id, kind, date: null, weekday, start_date, end_date } };
  }
  return { error: "Kind must be 'once' or 'weekly'" };
}
