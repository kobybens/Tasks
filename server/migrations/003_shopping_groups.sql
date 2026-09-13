CREATE TABLE IF NOT EXISTS shopping_groups (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS shopping_groups_name_lower ON shopping_groups (lower(name));

INSERT INTO shopping_groups (name, position, is_default) VALUES
  ('Vegetables & fruit', 1, 0),
  ('Dairy & eggs', 2, 0),
  ('Meat & fish', 3, 0),
  ('Bread & bakery', 4, 0),
  ('Pantry', 5, 0),
  ('Frozen', 6, 0),
  ('Drinks', 7, 0),
  ('Household', 8, 0),
  ('Other', 9, 1);

ALTER TABLE shopping_items ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES shopping_groups(id) ON DELETE SET NULL;
UPDATE shopping_items SET group_id = (SELECT id FROM shopping_groups WHERE is_default = 1) WHERE group_id IS NULL;
