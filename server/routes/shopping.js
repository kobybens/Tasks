import { Router } from 'express';
import { all, one, run } from '../db.js';

const MAX_TEXT = 200;
const MAX_GROUP = 40;
const MAX_QTY = 999;

// Items whose group was removed fall back to the default ("Other") group.
const ITEM_SELECT = `SELECT i.id, i.text, i.qty, i.done, i.created_by, i.created_at,
                            COALESCE(i.group_id, (SELECT id FROM shopping_groups WHERE is_default = 1)) AS group_id
                       FROM shopping_items i`;
const GROUP_SELECT = 'SELECT * FROM shopping_groups ORDER BY is_default ASC, position ASC, id ASC';

export default function shoppingRoutes(db) {
  const r = Router();

  /* ---------- groups (declared before /:id so "groups" is never parsed as an item id) ---------- */

  r.get('/groups', async (_req, res, next) => {
    try {
      res.json({ groups: (await all(db, GROUP_SELECT)).map(shapeGroup) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/groups', async (req, res, next) => {
    try {
      const name = cleanText(req.body?.name, MAX_GROUP);
      if (!name) return res.status(400).json({ error: `Group name is required (max ${MAX_GROUP} characters)` });
      if (await one(db, 'SELECT id FROM shopping_groups WHERE lower(name) = lower(?)', [name])) {
        return res.status(409).json({ error: 'A group with that name already exists' });
      }
      const { rows } = await run(
        db,
        `INSERT INTO shopping_groups (name, position)
         VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM shopping_groups WHERE is_default = 0)) RETURNING id`,
        [name],
      );
      res.status(201).json({ group: shapeGroup(await one(db, 'SELECT * FROM shopping_groups WHERE id = ?', [rows[0].id])) });
    } catch (err) {
      next(err);
    }
  });

  r.patch('/groups/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!(await one(db, 'SELECT id FROM shopping_groups WHERE id = ?', [id]))) return res.status(404).json({ error: 'Group not found' });
      const name = cleanText(req.body?.name, MAX_GROUP);
      if (!name) return res.status(400).json({ error: `Group name is required (max ${MAX_GROUP} characters)` });
      if (await one(db, 'SELECT id FROM shopping_groups WHERE lower(name) = lower(?) AND id != ?', [name, id])) {
        return res.status(409).json({ error: 'A group with that name already exists' });
      }
      await run(db, 'UPDATE shopping_groups SET name = ? WHERE id = ?', [name, id]);
      res.json({ group: shapeGroup(await one(db, 'SELECT * FROM shopping_groups WHERE id = ?', [id])) });
    } catch (err) {
      next(err);
    }
  });

  r.delete('/groups/:id', async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const group = await one(db, 'SELECT * FROM shopping_groups WHERE id = ?', [id]);
      if (!group) return res.status(404).json({ error: 'Group not found' });
      if (Number(group.is_default)) return res.status(400).json({ error: 'The "Other" group cannot be deleted' });
      const { rowsAffected } = await run(
        db,
        'UPDATE shopping_items SET group_id = (SELECT id FROM shopping_groups WHERE is_default = 1) WHERE group_id = ?',
        [id],
      );
      await run(db, 'DELETE FROM shopping_groups WHERE id = ?', [id]);
      res.json({ ok: true, moved: rowsAffected });
    } catch (err) {
      next(err);
    }
  });

  /* ---------- items ---------- */

  r.get('/', async (_req, res, next) => {
    try {
      const [items, groups] = await Promise.all([
        all(db, `${ITEM_SELECT} ORDER BY i.done ASC, i.created_at ASC, i.id ASC`),
        all(db, GROUP_SELECT),
      ]);
      res.json({ items: items.map(shapeItem), groups: groups.map(shapeGroup) });
    } catch (err) {
      next(err);
    }
  });

  r.post('/', async (req, res, next) => {
    try {
      const text = cleanText(req.body?.text, MAX_TEXT);
      if (!text) return res.status(400).json({ error: `Item text is required (max ${MAX_TEXT} characters)` });
      const groupId = await resolveGroup(db, req.body?.group_id);
      if (groupId === undefined) return res.status(400).json({ error: 'Group does not exist' });
      const qty = parseQty(req.body?.qty, 1);
      if (qty === undefined) return res.status(400).json({ error: `Quantity must be a whole number from 1 to ${MAX_QTY}` });
      const { rows } = await run(db, 'INSERT INTO shopping_items (text, qty, group_id, created_by) VALUES (?, ?, ?, ?) RETURNING id', [
        text,
        qty,
        groupId,
        req.user.id,
      ]);
      res.status(201).json({ item: await loadItem(db, rows[0].id) });
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
      const { text, done, group_id, qty } = req.body ?? {};
      const nextQty = parseQty(qty, Number(existing.qty));
      if (nextQty === undefined) return res.status(400).json({ error: `Quantity must be a whole number from 1 to ${MAX_QTY}` });
      let nextText = existing.text;
      if (text !== undefined) {
        nextText = cleanText(text, MAX_TEXT);
        if (!nextText) return res.status(400).json({ error: `Item text is required (max ${MAX_TEXT} characters)` });
      }
      let nextGroup = existing.group_id;
      if (group_id !== undefined) {
        nextGroup = await resolveGroup(db, group_id);
        if (nextGroup === undefined) return res.status(400).json({ error: 'Group does not exist' });
      }
      const nextDone = done === undefined ? Number(existing.done) : done ? 1 : 0;
      await run(db, 'UPDATE shopping_items SET text = ?, qty = ?, done = ?, group_id = ? WHERE id = ?', [nextText, nextQty, nextDone, nextGroup, id]);
      res.json({ item: await loadItem(db, id) });
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

/** Return the group id to store: the given one if it exists, the default group when omitted, undefined when invalid. */
async function resolveGroup(db, raw) {
  if (raw === undefined || raw === null || raw === '') {
    const d = await one(db, 'SELECT id FROM shopping_groups WHERE is_default = 1');
    return Number(d.id);
  }
  const id = Number(raw);
  if (!Number.isInteger(id)) return undefined;
  const g = await one(db, 'SELECT id FROM shopping_groups WHERE id = ?', [id]);
  return g ? Number(g.id) : undefined;
}

async function loadItem(db, id) {
  const row = await one(db, `${ITEM_SELECT} WHERE i.id = ?`, [id]);
  return row ? shapeItem(row) : undefined;
}

function cleanText(v, max) {
  if (typeof v !== 'string') return '';
  const t = v.trim().replace(/\s+/g, ' ');
  return t.length > max ? '' : t;
}

function shapeItem(row) {
  return {
    id: Number(row.id),
    text: row.text,
    qty: Number(row.qty ?? 1),
    done: Boolean(Number(row.done)),
    group_id: Number(row.group_id),
    created_by: row.created_by == null ? null : Number(row.created_by),
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}

function shapeGroup(row) {
  return { id: Number(row.id), name: row.name, is_default: Boolean(Number(row.is_default)) };
}

/** Whole number 1..MAX_QTY; `fallback` when omitted; undefined when invalid. */
function parseQty(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > MAX_QTY) return undefined;
  return n;
}
