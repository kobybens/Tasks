# Family Tasks — UI Review

**Audited:** 2026-09-12
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md exists)
**Screenshots:** Partially captured. Dev server found on `http://localhost:3000`; login screen captured at 375x812 (light and dark) and 1440x900 with Playwright 1.60 (chromium-1223). Authenticated screens (Week, Car, Admin, Account, sheets) were audited from code only — no credentials were used. Captures are in `.planning/ui-reviews/ui-review-20260912-225350/` (gitignored).
**Registry audit:** not applicable (no `components.json`, no third-party component registries — plain CSS/JS).

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 3/4 | Empty states and confirmations are specific and humane; generic `Save`/`Cancel` in both sheets, and raw transport errors (`Failed to fetch`, `HTTP 500`) reach the user verbatim |
| 2. Visuals | 2/4 | "Today" is marked by a 1px amber border (1.97:1 against page bg) and is not scrolled into view; task rows have no tap affordance; login uses the browser default focus ring and shows a phantom gap |
| 3. Color | 2/4 | Four measured AA failures: dark-mode `--danger` text 3.49:1, dark primary button text 3.68:1, white check glyph on yellow/green/cyan/orange member colors 1.9–2.8:1, muted small text on today header 4.34:1. Dark-mode muted body text itself passes (5.97–6.64:1) |
| 4. Typography | 3/4 | Coherent hierarchy, but 7 distinct sizes (24/20/18/16/14/13/11) and 4 weights; 11px uppercase section labels and 13px assignee meta are the two most-read secondary strings on a phone |
| 5. Spacing | 2/4 | Admin member rows wrap to 3 lines at 375px; done-checkbox hit area is 26x26 inside a 44px row; 7 different corner radii with only one tokenized; ad-hoc spacing values 4/6/8/10/12/14/16/20/24/28; empty `.error` reserves height in every form |
| 6. Experience Design | 2/4 | Optimistic done-toggle never reverts on API failure; week navigation flashes "Nothing planned" on all 7 cards while loading; no pending state on any submit (double-submit possible); native `prompt()` for password reset |

**Overall: 14/24**

---

## Top fixes (prioritized, max 8)

Each item is plain CSS/JS, no build step. Ordered by visual/UX payoff per unit of risk.

### 1. Make the done checkbox a real 44px target and revert it if the save fails — BLOCKER
`styles.css:192-200` sizes `.check` at 26x26. The row is 44px tall but the button is not; a thumb landing 10px off the box hits `.row .edit` and opens the edit sheet instead. This is the app's single most frequent action.
```css
/* styles.css — replace .check block */
.check {
  position: relative;
  width: 26px; height: 26px; flex: 0 0 26px;
  border-radius: 7px; border: 2px solid var(--muted);
  background: transparent; display: grid; place-items: center;
  font-size: 16px; font-weight: 900; line-height: 1; color: #fff;
}
.check::after { content: ""; position: absolute; inset: -9px; }   /* 44x44 hit area, no visual change */
```
`app.js:211-220` flips `aria-checked` and `.done` before awaiting the PATCH; the `catch` at `app.js:233-235` only toasts. Wrap the await:
```js
try {
  await api(`/api/tasks/${taskId}/done/${date}`, { method: done ? 'DELETE' : 'PUT' });
} catch (ex) {
  btn.setAttribute('aria-checked', String(done));
  btn.textContent = done ? '✓' : '';
  btn.closest('.row')?.classList.toggle('done', done);
  throw ex;
}
```
Also set `btn.textContent = done ? '' : '✓'` on the optimistic path — today the glyph does not update until the next full render.

### 2. Make "today" unmistakable and land on it
`styles.css:153` only recolors the 1px border (`#f59e0b` on `#f4f5f7` = 1.97:1) and tints the header (`styles.css:162`). On a phone, 7 stacked cards under a 108px sticky header means today is below the fold from Wednesday onward and nothing scrolls to it.
```css
.day.today { border: 2px solid var(--today-border); }
.day.today .day-head .d { color: #92400e; }                 /* light */
@media (prefers-color-scheme: dark) { .day.today .day-head .d { color: #fbbf24; } }
.pill { display:inline-block; margin-left:6px; padding:1px 7px; border-radius:999px;
        background: var(--today-border); color:#fff; font-size:11px; font-weight:700;
        text-transform: uppercase; letter-spacing:.04em; vertical-align: 2px; }
```
`week.js:30`: replace `${isToday ? ' · Today' : ''}` with `${isToday ? '<span class="pill">Today</span>' : ''}` (move it outside `<small>`).
`app.js:53-66` (`loadWeek`), after the final `render()` in `finally`, add once per load on narrow screens:
```js
if (matchMedia('(max-width: 699px)').matches && state.weekStart === weekStartOf(todayIso()))
  document.querySelector('.day.today')?.scrollIntoView({ block: 'start' });
```
Guard with a module-level `let scrolledOnce = false` so week navigation does not re-scroll. Combine with item 7 (shorter header) so the card is not hidden under the sticky bar; otherwise add `scroll-margin-top: 112px` to `.day`.

### 3. Stop admin member rows from wrapping at 375px
`admin.js:20-25` renders up to four text buttons ("Reset password", "Color", "Make admin"/"Remove admin", "Delete") in `.user-row .ops`. At 375px the usable width inside `.main` (12) + `.card` (14) + `.user-row` (8) is 307px; the buttons need ~340px, so they wrap unevenly onto a third line and every row is ~120px tall. `styles.css:277` also shrinks them to 36px.
```css
.user-row .ops { flex-basis: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.user-row .ops .btn { min-height: 44px; padding: 0 10px; font-size: 14px; }
@media (min-width: 700px) {
  .user-row .ops { flex-basis: auto; display: flex; }
  .user-row .ops .btn { min-height: 36px; }
}
```
Result: name line on top, a tidy 2x2 grid of 44px buttons beneath, identical for every member. Lower priority follow-up: `admin.js:91` "Color" cycles the palette with one PATCH per tap and no preview — reuse `openSheet` with the existing `.swatches` markup instead.

### 4. Fix the four measured contrast failures
Measured with WCAG relative luminance:

| Pair | Ratio | Where |
|------|-------|-------|
| `#dc2626` on `#1a1d24` (dark `--danger` text) | 3.49 | `.error` 14px, `.btn.danger` — `styles.css:10,133,249` |
| `#ffffff` on `#3b82f6` (dark `--accent` button/tab text) | 3.68 | `.btn.primary`, `.tab[aria-selected]`, `.badge` — `styles.css:26,106,132` |
| `#ffffff` check on `#eab308` / `#22c55e` / `#06b6d4` / `#f97316` | 1.92 / 2.28 / 2.43 / 2.80 | `.check[aria-checked="true"]` — `styles.css:201`, palette `lib.js:8` |
| `#6b7280` on `#fef3c7` (13px date in today header, light) | 4.34 | `.day.today .day-head .d small` — `styles.css:162-164` |

```css
@media (prefers-color-scheme: dark) { :root { --danger: #f87171; --accent: #2563eb; } }   /* 6.2:1 and 5.17:1 */
.check[aria-checked="true"] { background: var(--who, var(--accent)); border-color: var(--who, var(--accent));
                              color: #fff; text-shadow: 0 1px 1px rgba(0,0,0,.6); }
.day.today .day-head .d small { color: #78350f; }
@media (prefers-color-scheme: dark) { .day.today .day-head .d small { color: #fcd34d; } }
```
If `#2563eb` looks too dull on the dark surface, keep `#3b82f6` for `.tab[aria-selected]` only (44px bold is borderline large text) and use `#2563eb` for `.btn.primary`.
Also `index.html:6`: `theme-color` is `#1f2937`, which matches neither theme's `--bg`. Replace with two tags:
`<meta name="theme-color" content="#f4f5f7" media="(prefers-color-scheme: light)">` and `<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">`.

### 5. Honest loading and pending states
`app.js:121` shows "Loading…" only when `state.occurrences` is empty. On prev/next the stale occurrences are filtered by the new dates (`week.js:13-14`) so every card shows **"Nothing planned"** for the duration of the fetch, then fills in — the user briefly reads a false empty state. Fix in `week.js:renderDay` (top of the body computation):
```js
if (state.loading) { body = '<div class="empty">Loading…</div>'; }
else if (mode === 'week') { ... existing ... }
```
and drop the `!state.occurrences.length` condition at `app.js:121` (always call `renderWeek`).
No submit button in the app is disabled during its request (`app.js:159-173`, `taskForm.js:68-92`, `carForm.js:61-89`, `admin.js:52-73`, `account.js:25-40`). A slow connection plus a second tap creates a duplicate task or booking. Add to each handler:
```js
const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
try { ... } finally { submit.disabled = false; }
```
`.btn:disabled { opacity: .5 }` already exists at `styles.css:136`. Finally, `app.js:77` hides error toasts after the same 2600ms as success toasts — use `isError ? 5000 : 2600`.

### 6. Login polish: remove the phantom gap and own the focus ring
Confirmed in all three screenshots: a ~30px void between the password field and "Log in". `styles.css:249` gives `.error` `min-height: 1em` and the grid adds `gap: 14px` on both sides even when empty. The same void sits above `.actions` in every sheet and card form.
```css
.error:empty { display: none; }
```
The screenshots also show the Chromium default 2px black (light) / white (dark) focus outline on the autofocused input — the only element on the screen not using a token. Add once:
```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.field input:focus-visible, .field select:focus-visible, .field textarea:focus-visible { outline-offset: 0; border-color: var(--accent); }
```
Optional polish with zero risk: `.login h1` gets a mark — e.g. `<span class="dot" style="background:var(--accent)">` is already a pattern — and `.login form { gap: 12px; }` with `.login .btn.primary { margin-top: 4px; }` so the button reads as the terminal element.

### 7. Reclaim header height on phones and give rows a tap affordance
The sticky `.topbar` is two rows (brand + name + "Log out", then tabs): ~56px + 52px = 108px, 13% of a 375x812 viewport, above the 56px `.weeknav`. `.who` (`styles.css:85`) has no overflow handling, so a long display name pushes "Log out" and the brand together; `app.js:100` sets `min-height:36px` inline.
- Move "Log out" into the Account tab's first card (`account.js:6-9`) as `<button class="btn" data-action="logout">Log out</button>` — the click handler at `app.js:181-185` already handles it anywhere under `#app`. Remove it from `.who`.
- `.topbar-inner { padding: 8px 14px; }`, `.tabs { padding: 0 10px 6px; }`, `.who > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 40vw; }`.
- `.row .edit` (`styles.css:189-191`) is a full-width button with no hover/active/focus feedback, so nothing tells the user rows open an editor. Add:
```css
.row .edit:active, .row .edit:focus-visible { opacity: .65; }
@media (hover:hover) { .row:hover { background: var(--border); } }
```

### 8. Copy and token consistency
- **Contextual submit labels.** `taskForm.js:40` and `carForm.js:32` both say `Save`; `taskForm.js:39`/`carForm.js:31` say `Cancel`. Use `${editing ? 'Save changes' : 'Add task'}` and `${editing ? 'Save changes' : 'Book the car'}` — the sheet title (`taskForm.js:13`, `carForm.js:17`) already uses those verbs, so the button should echo it.
- **Friendly transport errors.** `app.js:31` has no catch around `fetch`, so offline users see `Failed to fetch`; `app.js:24` falls back to `HTTP 500`; `server/index.js:48` sends `Server error`; `server/routes/tasks.js:154,162` send developer strings (`0 = Sunday .. 6 = Saturday`, `Kind must be 'once' or 'weekly'`). In `api()`: `catch (e) { throw new ApiError(0, { error: "Can't reach the server. Check your connection and try again." }) }` around `fetch`, and map `status >= 500` to `"Something went wrong on our side. Please try again."`.
- **Verb consistency.** Login screen says "Sign in to see the week." (`app.js:148`) but the button (`app.js:152`) and header (`app.js:100`) say "Log in"/"Log out". Pick one: "Log in to see the week."
- **Radius tokens.** Seven radii are in use — 12 (`--radius`), 10 (`.btn:126`, inputs `:233`, `.radio-row label:242`, `.toast:283`), 8 (`.tab:101`, `.row:181`, `.user-row:270`), 7 (`.check:194`), 6 (`.badge:274`), 18 (`.sheet:215`), 16 (`.sheet` desktop `:223`). Add `--radius-sm: 8px; --radius-lg: 18px;` to `:root`, map 10 and 8 to `var(--radius-sm)`, 16 and 18 to `var(--radius-lg)`, 7 to 6. Visual delta is 1–2px; consistency gain is large.
- **Type floor.** `.section-label` (`styles.css:168`) 11px to 12px; `.row .m` (`styles.css:187`) and `.hint` (`:250`) 13px to 14px; `.weeknav .title small` (`:119`) 13px to 14px. That collapses the scale to 24/20/18/16/14/12 (+11px badges) and removes the least legible strings from the most-scanned rows.
- **Inline styles to classes.** `app.js:100` (`min-height:36px`) and `admin.js:42` (`display:flex;gap:8px;...`) — move to `.btn.sm` and `.checkline`.

---

## Detailed Findings

### Pillar 1: Copywriting (3/4)

Strengths worth keeping:
- Empty states are situational, not generic: "Nothing planned" (`week.js:22`) and "Car is free" (`week.js:24`) — the latter is a genuinely good line.
- Destructive confirmations state consequences: `admin.js:100` "Delete {name}? Their tasks and car bookings will be removed too."; `taskForm.js:56` "Delete this weekly task from every week?".
- Conflict error is humanized: `carForm.js:84` "{driver} already has the car {when}." instead of the server's `overlap`.
- Toasts are specific past-tense outcomes: "Task added", "Car booked", "{name} added", "Password for {name} was reset".

WARNING findings:
- **Generic CTAs in both sheets.** `taskForm.js:39-40`, `carForm.js:31-32`: `Cancel` / `Save` under a heading that already says "New task" / "Book the car". See Top fix 8.
- **Developer strings reach the UI.** Every `catch` assigns `ex.message` straight to the DOM (`app.js:171`, `taskForm.js:64,90`, `carForm.js:86`, `admin.js:71`, `account.js:38`). Sources: `app.js:24` fallback `HTTP ${status}`; uncaught `fetch` rejection = `Failed to fetch`; `server/index.js:48` `Server error`; `server/routes/tasks.js:154` `A weekly task needs a weekday (0 = Sunday .. 6 = Saturday)`; `tasks.js:162` `Kind must be 'once' or 'weekly'`; `car.js:101` `Start and end must be YYYY-MM-DDTHH:MM`. The validation ones are unreachable through the UI in practice, but `Failed to fetch` on a phone with poor signal is the most likely error a family member will ever see.
- **Verb inconsistency.** "Sign in to see the week." (`app.js:148`) vs "Log in" button (`app.js:152`) vs "Log out" (`app.js:100`).
- **"Color" button is a mystery verb.** `admin.js:22` — the label does not say it advances to the next palette color; nothing previews the result.
- **Empty states carry no next step.** "Nothing planned" could invite action for a first-time user; on desktop the `+` is 20px away, on a phone it is a muted ghost glyph. Consider "Nothing planned — tap + to add" only on the *current* day to avoid noise.
- Minor: `week.js:43` renders ` · weekly` lower-case while the form says "Every week" (`taskForm.js:21`); `account.js:30` "The new passwords do not match" is fine but the server's `Current password is wrong` (`server/routes/auth.js:37`) could be "That isn't your current password."

### Pillar 2: Visuals (2/4)

- **Weak focal point for today.** `styles.css:153` `.day.today { border-color: var(--today-border) }` at 1px; `:162` tints the header `#fef3c7`. Measured border-vs-page contrast 1.97:1 (light). Dark mode `#d97706` on `#1a1d24` is 5.29:1 — noticeably better, meaning light mode users get the weakest cue. No scroll to today (`app.js:53-66`). The `＋` button on every card (`week.js:31`) is `.btn.icon.ghost` — muted grey, identical on today and other days, so the single most important add button has no more weight than the other six.
- **Row scannability depends on a 4px stripe.** `styles.css:182` `border-left: 4px solid var(--who)`. Row background `--surface-2` (#f9fafb) against card `--surface` (#fff) is a 1.02:1 difference — rows do not read as discrete objects in light mode; the 4px `gap` (`:165`) does the work. The assignee's name sits in 13px muted text (`week.js:43`, `styles.css:187`). Five family members share eight palette colors including two blues (`#06b6d4`, `#3b82f6`) and violet/pink (`#8b5cf6`, `#ec4899`); on a small stripe those pairs are hard to tell apart. A 20px initials disc using `--who` in place of, or beside, the stripe would let a child scan "mine" in one glance.
- **No affordance that rows are tappable.** `.row .edit` (`styles.css:189-191`) has `border: 0; background: transparent` and no `:hover`/`:active` rule. Only `.btn:active` (`:131`) gives feedback anywhere.
- **Login screen** (screenshots): visually clean but unbranded — a 24px heading and two fields. The phantom `.error` gap between password and button reads as a layout bug (Top fix 6). Focus ring is the UA default (2px black in light, white in dark), inconsistent with the accent-driven system. On 1440x900 the 360px card floats in the upper-middle with nothing else; acceptable, but a subtle brand mark (colored dot echoing the member-color language) would tie it to the app.
- **Header on small screens.** Two sticky rows totalling ~108px (`styles.css:68-106`). "Log out" as a ghost button in the identity chip is visually noisy for a once-a-month action and competes with the brand.
- **Icon-only buttons are labelled** — good: `aria-label` + `title` on `＋` (`week.js:31`), `aria-label` on prev/next (`app.js:136,139`), `aria-label="Mark {title} done"` on the check (`week.js:40`). The `🚗` emoji prefix via `::before` (`styles.css:202`) is the only pictorial element in an otherwise flat UI and renders with platform-specific color/size; a monochrome inline SVG or simply the "Car" section label would be more consistent.
- **Selected swatch** (`styles.css:256`) uses a 3px ring in `--text`; on the yellow swatch in light mode the ring is clear, but there is no check glyph, so the "which one is selected" state depends on noticing a ring among eight circles.

### Pillar 3: Color (2/4)

Token discipline is good: all UI colors flow through `:root` custom properties with a dark override (`styles.css:1-31`); member colors travel as `--who` (`week.js:39,54`). Hardcoded literals are limited to `rgba()` shadows/backdrops, `.toast.err { color:#fff }` (`:286`), and the data palette in `lib.js:8`. Accent is applied to few things (selected tab, primary button, admin badge, selected radio) — no accent overuse.

Measured contrast (WCAG 2.x relative luminance):

| Pair | Light | Dark | Verdict |
|------|-------|------|---------|
| `--muted` on `--surface` (body meta text) | 4.83 | 6.64 | pass |
| `--muted` on `--surface-2` (row meta, `.row .m`) | 4.63 | 5.97 | pass |
| `--muted` on `--today` header (`.d small`) | **4.34** | 5.19 | **light fails AA for 13px** |
| `--danger` on `--surface` (`.error`, `.btn.danger`) | 4.83 | **3.49** | **dark fails** |
| `--accent-text` on `--accent` (`.btn.primary`, selected `.tab`) | 5.17 | **3.68** | **dark fails** |
| white `✓` on palette yellow/green/cyan/orange | **1.92 / 2.28 / 2.43 / 2.80** | same | **fails** |
| `--today-border` on `--bg` (today outline) | **1.97** | 5.29 | light too faint for a 1px cue |
| `--border` on `--surface` (card outline) | 1.13 | 1.34 | decorative; shadow carries the edge |
| toast text on toast bg | 15.3 | 15.3 | pass |

Additional findings:
- `index.html:6` `theme-color #1f2937` matches neither theme; mobile browser chrome shows a slate bar over a near-white or near-black page.
- The done state (`styles.css:188`) recolors the title to `--muted` with strike-through; combined with the `--who` filled check this is clear. But `.check` unchecked border is `--muted` 2px — on a `--surface-2` row in light mode this is the same grey as the meta text, so the checkbox does not read as interactive.
- `.swatches label` (`:254`) has no inner contrast treatment; `#eab308` on white is 1.92:1 — fine for a 36px disc, but the `--text` selection ring is the only state cue.
- Dark `--shadow` (`:29`) is a single 1px hairline, so cards depend entirely on `--border` (#2e3340 on #1a1d24 = 1.34:1) — acceptable, but `.day` cards in dark mode are visibly flatter than in light.

### Pillar 4: Typography (3/4)

System font stack at 16px/1.4 (`styles.css:36`) — appropriate for a family utility app; `font: inherit` on controls (`:42`) keeps inputs consistent.

Size inventory (px): 24 `.login h1`; 20 `.sheet h2`, `.btn.icon`; 18 `.brand`, `.card h2`; 16 base; 15 `.check` glyph; 14 `.who`, `.field label`, `.empty`, `.error`, `.ops .btn`; ~13.3 implicit `<small>` in `.day-head .d`; 13 `.row .m`, `.hint`, `.weeknav small`; 11 `.section-label`, `.badge`. That is 7 intentional sizes plus one implicit — the abstract standard flags more than 4. Weights: 400, 500 (`.day-head small`, done title), 600 (labels, tabs, row titles, buttons), 700 (brand, day names, badge) — 4 weights vs a standard of 2.

Findings:
- 13px and 14px both serve "secondary text" with no semantic difference (`.row .m` 13 vs `.empty` 14 vs `.field label` 14). Collapse to 14.
- `.section-label` at 11px uppercase muted (`:167-173`) is the label that separates tasks from car bookings inside a card; at 11px with 0.06em tracking it is the least legible string on the screen. 12px minimum.
- `.day-head .d small` is not given an explicit size, so it inherits the UA `smaller` (≈13.3px) — an unintended eighth size. Set `font-size: 14px`.
- Times in `.car-row .t` (`week.js:56`) are 16px/600 proportional figures; `font-variant-numeric: tabular-nums` on `.row .t` would align "9:00–11:30" and "16:00–18:00" across rows for free.
- Headings have no explicit `line-height`; at 24px x 1.4 the login h1 has 34px of line box, slightly loose. `h1, h2 { line-height: 1.2 }` tightens the login and sheet headers.
- On the 7-column desktop grid (`:143-145`) each column is ~145–190px at 1100–1400px; a 16px/600 title with `overflow-wrap: anywhere` (`:186`) will break inside words. Either raise the 7-col breakpoint to 1300px or drop title weight to 500 above 1100px.

### Pillar 5: Spacing (2/4)

Spacing values in use: 4, 6, 8, 10, 12, 14, 16, 20, 24, 28 — no scale; 6/10/14 are off any 4px grid and appear alongside their neighbors (`.days gap:10` vs `.main padding:12` vs `.card padding:14` vs `.sheet padding:16`). Only `--radius`, `--tap` are tokenized.

Radius inventory: 12 (`--radius`), 10, 8, 7, 6, 16, 18 — seven values (see Top fix 8 for line references).

Findings:
- **Admin member rows wrap at 375px** (`admin.js:14-26`, `styles.css:270-277`). Available width is 307px; four text buttons need ~340px; `.ops` has `flex-wrap: wrap` so the fourth (or third and fourth) button drops to a third line, and the row height varies per member depending on whether "Make admin"/"Remove admin" and "Delete" are present. Top fix 3.
- **Sub-44px tap targets** despite `--tap: 44px`: `.check` 26x26 (`:193`), `.user-row .ops .btn` 36 (`:277`), "Log out" 36 via inline style (`app.js:100`), `.row .edit` 36 (`:190`). The check is the critical one.
- **Phantom form gap.** `.error { min-height: 1em }` (`:249`) inside `gap: 12–14px` grids means every form has a ~28–34px hole above its actions even when there is no error — confirmed in the login screenshots.
- **Sticky header + weeknav** consume ~164px before the first day card on a 375x812 phone (108 header + 56 nav). `.tabs` bottom padding 8 and `.topbar-inner` vertical padding 10 can each drop 2px; moving "Log out" out saves visual weight rather than height.
- **Day-card body** `padding: 6px 8px 8px; gap: 4px` (`:165`) is tighter than the card header `8px 8px 8px 12px` (`:158`): the 4px inter-row gap plus near-identical `--surface-2` row background means rows visually merge in light mode. `gap: 6px` and `padding: 8px` would match the header rhythm.
- **Desktop 7-column grid** at `min-width: 1100px` (`:143-145`) gives ~145px columns at 1100px; rows carry 26px check + 8 gap + 4 border + 12 padding = 50px of chrome, leaving ~95px for text. Use `grid-template-columns: repeat(auto-fill, minmax(190px, 1fr))` from 700px up and let the browser pick 3/4/5/7 columns, or move the 7-col rule to 1300px.
- Inline spacing in markup: `admin.js:42` `style="display:flex;gap:8px;align-items:center;min-height:44px"`; `app.js:100` `style="min-height:36px"`.

### Pillar 6: Experience Design (2/4)

State coverage inventory:

| State | Present | Notes |
|-------|---------|-------|
| Loading | partial | `app.js:121` only when no occurrences cached; `state.loading` otherwise renders stale-filtered data = false empty state |
| Error | yes | `.error` slot in every form; toast for click actions (`app.js:234`); 401 drops to login silently (`app.js:38-42`) |
| Empty | yes | per-day "Nothing planned" / "Car is free"; admin list has no empty state but always contains the current admin |
| Disabled | partial | "Today" button (`app.js:138`); no submit is disabled during its request |
| Destructive confirm | yes | `confirm()` with consequences (`taskForm.js:56`, `carForm.js:50`, `admin.js:100`) |
| Optimistic UI | yes, no rollback | `app.js:211-220` |
| Focus management | partial | first control focused on sheet open (`lib.js:72-73`); no focus trap; no focus restore on close |
| Keyboard | partial | Esc closes sheet (`lib.js:82-84`); tabs have `role="tab"` but no arrow-key handling |
| Motion | partial | sheet slide-up (`styles.css:218`), no `prefers-reduced-motion` guard |

Findings:
- **Optimistic toggle without rollback** (`app.js:211-220`). On a failed PATCH/DELETE the row stays flipped, the toast says the request failed, and `occ.done` is never updated — the UI and server disagree until the next navigation. Top fix 1.
- **False empty state during week navigation** (`app.js:121` + `week.js:13-14,22`). Every prev/next tap shows seven "Nothing planned" cards for the round-trip duration. Top fix 5.
- **No pending state on any submit.** All five forms can be double-submitted; task and car POSTs are not idempotent, so a slow tap creates duplicates. Top fix 5.
- **Native dialogs for password reset** (`admin.js:84` `prompt()`): renders the new password in plain text in an OS dialog, cannot be styled for dark mode, and breaks the sheet language used everywhere else. `openSheet` (`lib.js:62`) plus a `.field` and `.actions` is a 20-line replacement; `confirm()` for deletes is acceptable for a family app but would benefit from the same treatment eventually.
- **"Color" cycles server state per tap** (`admin.js:90-95`): 1 PATCH + `loadUsers()` + full re-render per step, up to 7 steps to reach a color, no preview. Replace with the existing `.swatches` control in a sheet.
- **Done checkbox 26px hit area** — see Pillar 5 / Top fix 1. This is a BLOCKER-class defect for the primary daily interaction, especially for the younger family members the product context implies.
- **Session expiry is silent.** `app.js:38-42` swaps to the login screen with no message; the user does not know why. Set a one-shot `state.notice = 'You were signed out. Please log in again.'` rendered into `#login-error`.
- **Error toasts vanish as fast as success toasts** (2600ms, `app.js:77`).
- **Sheet a11y**: no focus trap and focus is not returned to the triggering `+`/row after `closeSheet()` (`lib.js:77-80`). Store `document.activeElement` on open and `.focus()` it on close.
- **Reduced motion**: add `@media (prefers-reduced-motion: reduce) { .sheet { animation: none; } }`.
- Positive: the car form's "return date follows date unless touched" logic (`carForm.js:40-47`) is a thoughtful small-detail interaction; the conflict message (`carForm.js:78-84`) is exemplary error design.

---

## Files Audited

- `C:\Essence_SC\Projects\tasks\public\index.html`
- `C:\Essence_SC\Projects\tasks\public\styles.css`
- `C:\Essence_SC\Projects\tasks\public\app.js`
- `C:\Essence_SC\Projects\tasks\public\lib.js`
- `C:\Essence_SC\Projects\tasks\public\views\week.js`
- `C:\Essence_SC\Projects\tasks\public\views\taskForm.js`
- `C:\Essence_SC\Projects\tasks\public\views\carForm.js`
- `C:\Essence_SC\Projects\tasks\public\views\admin.js`
- `C:\Essence_SC\Projects\tasks\public\views\account.js`
- Server error strings consulted (read-only, for copy audit): `server/index.js`, `server/auth.js`, `server/routes/auth.js`, `server/routes/tasks.js`, `server/routes/car.js`
- Screenshots: `.planning/ui-reviews/ui-review-20260912-225350/login-mobile.png`, `login-mobile-dark.png`, `login-desktop.png`
