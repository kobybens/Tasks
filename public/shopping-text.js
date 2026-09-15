/**
 * Plain-text version of the shopping list for sharing (WhatsApp, SMS, clipboard).
 * Pure module: no DOM access, so it is unit tested from Node.
 *
 * @param {{text: string, done: boolean, group_id: number}[]} items
 * @param {{id: number, name: string}[]} groups   in display order
 * @param {{title?: string, date?: string}} [opts]
 * @returns {string} empty string when nothing is left to buy
 */
export function formatShoppingList(items, groups, { title = 'Super list', date = '' } = {}) {
  const open = items.filter((i) => !i.done);
  if (!open.length) return '';
  const lines = [`🛒 *${title}*${date ? ` – ${date}` : ''}`];
  for (const g of groups) {
    const mine = open.filter((i) => i.group_id === g.id);
    if (!mine.length) continue;
    if (groups.length > 1) lines.push('', `*${g.name}*`);
    for (const i of mine) lines.push(itemLine(i));
  }
  // Items whose group is unknown (should not happen, but never lose an item).
  const known = new Set(groups.map((g) => g.id));
  const orphans = open.filter((i) => !known.has(i.group_id));
  if (orphans.length) {
    lines.push('');
    for (const i of orphans) lines.push(itemLine(i));
  }
  return lines.join('\n');
}

function itemLine(i) {
  return `• ${i.text}${i.qty > 1 ? ` ×${i.qty}` : ''}`;
}

/** WhatsApp click-to-chat URL that opens a new message with the text prefilled. */
export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
