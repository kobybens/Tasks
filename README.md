# Family Tasks

A small private web app for one family: a shared weekly calendar of household tasks
(who does what on which day) and car reservations (who has the car and when).

- Username and password login for each family member, no public sign-up.
- Tasks are one-off or repeat every week on a given day. Each occurrence can be ticked done.
- Car bookings that overlap another booking are rejected, and the message tells you who has the car.
- One admin creates the accounts and can reset passwords. Everyone can edit any task or booking.
- Mobile-first, works in any modern browser, light and dark mode.

Stack: Node.js + Express, plain HTML/CSS/JS frontend (no build step), SQLite dialect through
the libSQL client (local file in development, [Turso](https://turso.tech) in production).

## Run locally

```bash
npm install
cp .env.example .env      # then edit SESSION_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD
npm run dev               # http://localhost:3000
```

On the first start, when the users table is empty, the admin account is created from
`ADMIN_USERNAME` / `ADMIN_PASSWORD`. Log in as that admin, open the **Admin** tab and add the
rest of the family. The local database lives in `data/family.db`.

```bash
npm test                  # API and unit tests (in-memory database)
```

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | `file:data/family.db` locally, `libsql://<db>-<org>.turso.io` in production |
| `DATABASE_AUTH_TOKEN` | Turso auth token (production only) |
| `SESSION_SECRET` | Long random string used to sign the session cookie |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD` | Initial admin, used only when there are no users yet |
| `PORT` | Defaults to 3000 |
| `NODE_ENV` | Set to `production` on the host so cookies are marked secure |

## Deploy for free (Render + Turso)

1. Push this folder to a GitHub repository.
2. **Turso database**
   - Install the Turso CLI and sign up: https://docs.turso.tech/cli/introduction
   - `turso db create family-tasks`
   - `turso db show family-tasks --url` gives `DATABASE_URL`
   - `turso db tokens create family-tasks` gives `DATABASE_AUTH_TOKEN`
3. **Render web service** at https://render.com
   - New → Web Service → connect the GitHub repo.
   - Runtime: Node. Build command: `npm ci`. Start command: `npm start`. Instance type: Free.
   - Environment variables: `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `SESSION_SECRET`
     (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`),
     `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `NODE_ENV=production`.
   - Deploy. The migrations run automatically on start and the admin is created.
4. Open the Render URL, log in as the admin, add the family in the **Admin** tab, share the link.

Notes on the free tier: the Render instance goes to sleep after about 15 minutes without
traffic and the first request afterwards takes around 30 seconds. Data is safe because it
lives in Turso, not on the instance. A free uptime pinger (for example UptimeRobot hitting
`/api/health` every 10 minutes) keeps it awake if that matters to you.

## API overview

All endpoints are JSON under `/api` and need the session cookie except login and health.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/auth/login` | `{username, password}` |
| POST | `/api/auth/logout` | |
| GET | `/api/auth/me` | current user |
| PATCH | `/api/auth/password` | `{current, next}` |
| GET | `/api/users` | list (any user) |
| POST / PATCH / DELETE | `/api/users[/:id]` | admin only; PATCH with `password` resets it |
| GET | `/api/tasks?from&to` | expanded occurrences with `done` flag |
| POST / PATCH / DELETE | `/api/tasks[/:id]` | `kind` is `once` (with `date`) or `weekly` (with `weekday`, optional `start_date`/`end_date`) |
| PUT / DELETE | `/api/tasks/:id/done/:date` | mark an occurrence done / not done |
| GET | `/api/car?from&to` | bookings intersecting the range |
| POST / PATCH / DELETE | `/api/car[/:id]` | `{user_id?, start_at, end_at, note?}`; overlap → `409 {error:'overlap', conflict}` |

Times are stored as plain local strings (`YYYY-MM-DDTHH:MM`); the app assumes one household timezone.

## Project layout

```
server/            Express app, routes, db helpers, migrations
server/lib/        pure helpers: dates, weekly recurrence expansion
public/            frontend: index.html, styles.css, app.js, lib.js, views/
test/              node:test + supertest suites
```
