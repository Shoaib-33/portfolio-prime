import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { getDb } from './db/client';
import { loadSession, SESSION_COOKIE, Req } from './common';
import { seedIfEmpty } from './seed/seed';

export async function createApp() {
  const db = await getDb(); await seedIfEmpty(db);
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.use(async (req: Req, _res: unknown, next: () => void) => { try { req.user = await loadSession(db, req.cookies?.[SESSION_COOKIE]); } catch { req.user = null; } next(); });
  app.use((_req: unknown, res: any, next: () => void) => { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin'); next(); });
  return app;
}
if (require.main === module) {
  createApp().then(async app => { const port = Number(process.env.PORT || 4000); await app.listen(port, '127.0.0.1'); console.log(`API ready on http://127.0.0.1:${port}/api (database: PGlite, demo mode)`); });
}
