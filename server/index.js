import express from 'express';
import cookieSession from 'cookie-session';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, runMigrations } from './db.js';
import { bootstrapAdmin, requireAuth, makeRateLimiter, makeFailureTracker } from './auth.js';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import taskRoutes from './routes/tasks.js';
import carRoutes from './routes/car.js';
import shoppingRoutes from './routes/shopping.js';
import notesRoutes from './routes/notes.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the Express app. Kept separate from `listen` so tests can mount it.
 * @param {{db: Awaited<ReturnType<typeof import('./db.js').createDb>>, sessionSecret: string, production?: boolean, loginLimit?: number, userLoginLimit?: number}} opts
 *   loginLimit: login attempts per IP per minute. userLoginLimit: failed attempts per username per 15 minutes.
 */
export function createApp({ db, sessionSecret, production = false, loginLimit = 10, userLoginLimit = 5 }) {
  if (!sessionSecret) throw new Error('SESSION_SECRET is not set');
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          // Member colors are applied through inline style attributes (validated hex on the server).
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      // Render terminates TLS; HSTS only makes sense on the real domain.
      strictTransportSecurity: production ? { maxAge: 180 * 24 * 60 * 60, includeSubDomains: false } : false,
    }),
  );
  // Photos arrive as base64 JSON; allow a bigger body on that one route only.
  app.use('/api/users/me/avatar', express.json({ limit: '400kb' }));
  app.use(express.json({ limit: '50kb' }));
  app.use(
    cookieSession({
      name: 'sid',
      keys: [sessionSecret],
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    }),
  );

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes(db, makeRateLimiter({ max: loginLimit }), makeFailureTracker({ max: userLoginLimit })));
  app.use('/api/users', requireAuth(db), userRoutes(db));
  app.use('/api/tasks', requireAuth(db), taskRoutes(db));
  app.use('/api/car', requireAuth(db), carRoutes(db));
  app.use('/api/shopping', requireAuth(db), shoppingRoutes(db));
  app.use('/api/notes', requireAuth(db), notesRoutes(db));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  app.use(express.static(path.join(rootDir, 'public'), { extensions: ['html'] }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}

async function main() {
  const { default: dotenv } = await import('dotenv');
  dotenv.config();
  const production = process.env.NODE_ENV === 'production';
  const db = await createDb();
  await runMigrations(db);
  await bootstrapAdmin(db);
  const app = createApp({ db, sessionSecret: process.env.SESSION_SECRET, production });
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`Family tasks listening on http://localhost:${port}`));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
