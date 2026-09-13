import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatShoppingList, whatsappUrl } from '../public/shopping-text.js';

const groups = [
  { id: 1, name: 'Vegetables & fruit' },
  { id: 4, name: 'Bread & bakery' },
  { id: 9, name: 'Other' },
];

test('groups unticked items under bold headers and skips empty groups and bought items', () => {
  const items = [
    { text: 'Bread', done: false, group_id: 4 },
    { text: 'Tomatoes', done: false, group_id: 1 },
    { text: 'Milk 2L', done: true, group_id: 9 },
    { text: 'Cucumbers', done: false, group_id: 1 },
  ];
  const text = formatShoppingList(items, groups, { date: '13 Sep' });
  assert.equal(
    text,
    ['🛒 *Super list* – 13 Sep', '', '*Vegetables & fruit*', '• Tomatoes', '• Cucumbers', '', '*Bread & bakery*', '• Bread'].join('\n'),
  );
});

test('returns an empty string when everything is bought', () => {
  assert.equal(formatShoppingList([{ text: 'Milk', done: true, group_id: 9 }], groups), '');
  assert.equal(formatShoppingList([], groups), '');
});

test('items with an unknown group are still listed', () => {
  const text = formatShoppingList([{ text: 'Mystery', done: false, group_id: 42 }], groups);
  assert.match(text, /• Mystery/);
});

test('whatsapp url encodes the text', () => {
  const url = whatsappUrl('a b\n*c*');
  assert.equal(url, 'https://wa.me/?text=a%20b%0A*c*');
});
