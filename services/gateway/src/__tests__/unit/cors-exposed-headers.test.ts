/**
 * Issue #5015 — le 304 de `GET /sync` (et tout autre ETag posé par
 * `conditionalGetOnSend`, `utils/etag.ts`) est du code qui ne peut jamais
 * s'exécuter pour un client de navigateur : `@fastify/cors` ne safelist pas
 * `ETag`, et sans `exposedHeaders` la porte HTTP le retient. Un client d'une
 * autre origine (`https://meeshy.me` appelant `https://gate.meeshy.me`) lit
 * alors `response.headers.get('etag') === null` et ne peut jamais composer
 * `If-None-Match`.
 *
 * Ce témoin construit la VRAIE app (le VRAI plugin CORS, la VRAIE route
 * `/sync`) — comme `unit/config/cors-origins.test.ts` le fait pour
 * l'allowlist — plutôt qu'une reconstitution qui ne pourrait jamais rougir.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import fs from 'fs';
import path from 'path';

import { CORS_METHODS, CORS_EXPOSED_HEADERS } from '../../config/cors-methods';
import { fastifyCorsOrigin } from '../../config/cors-origins';

const USER_ID = '507f1f77bcf86cd799439000';
const FOREIGN_ORIGIN = 'https://meeshy.me';

jest.mock('../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as any).authContext = { userId: USER_ID, type: 'user' };
    },
}));

jest.mock('../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../routes/sync';

function makePrisma() {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

/**
 * La même paire `cors` + route que `server.ts` assemble en production —
 * `origin`/`credentials`/`methods`/`exposedHeaders` — pour que ce témoin
 * exerce la VRAIE porte plutôt qu'une reconstitution.
 */
async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(cors, {
    origin: fastifyCorsOrigin({ env: { NODE_ENV: 'production', CORS_ORIGINS: FOREIGN_ORIGIN } }),
    credentials: true,
    methods: CORS_METHODS,
    exposedHeaders: CORS_EXPOSED_HEADERS,
  });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

describe('CORS — issue #5015 : ETag exposé aux clients d’une autre origine', () => {
  it('une requête `Origin` étrangère admise rend `access-control-expose-headers` contenant `etag`', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/sync?since=${SINCE}&collections=conversations`,
      headers: { origin: FOREIGN_ORIGIN },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers.etag).toBeTruthy();
    const exposed = String(res.headers['access-control-expose-headers'] ?? '').toLowerCase();
    expect(exposed).toContain('etag');
    await app.close();
  });

  it('`server.ts` déclare `exposedHeaders` avec la MÊME constante — un seul endroit', () => {
    const serverSource = fs.readFileSync(
      path.resolve(__dirname, '..', '..', 'server.ts'),
      'utf8'
    );
    expect(serverSource).toMatch(/exposedHeaders:\s*CORS_EXPOSED_HEADERS/);
  });
});
