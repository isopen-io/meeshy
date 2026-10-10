/**
 * `POST /tracking-links` ne rend jamais le lien d'un AUTRE utilisateur (#9184).
 *
 * La déduplication par URL retrouvait n'importe quel lien actif de la même
 * adresse : un compte sans aucun lien recevait `existed: true` avec le lien
 * d'un tiers — son `createdBy`, sa conversation, son message et ses compteurs
 * de clics — et sa propre liste restait vide.
 *
 * Témoin de comportement : le VRAI `TrackingLinkService` sur une base en
 * mémoire qui honore chaque clé du `where`, traversée par la route et par
 * les VRAIS schémas de réponse (aucun double de `api-schemas`).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn(() => Promise.resolve()),
  })),
}));

const registeredContext = (id: string) => ({
  type: 'registered' as const,
  isAuthenticated: true,
  userId: id,
  hasFullAccess: true,
  registeredUser: { id, username: id, role: 'USER' },
});

const anonymousContext = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  userId: 'anon-session',
  hasFullAccess: false,
  anonymousUser: null,
  registeredUser: null,
};

jest.mock('../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: any) => {
    const userId = req.headers['x-test-user'];
    req.authContext = userId ? registeredContext(userId) : anonymousContext;
  }),
  isRegisteredUser: jest.fn().mockImplementation((ctx: any) => ctx?.type === 'registered'),
  UnifiedAuthRequest: {},
}));

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

type StoredLink = Record<string, unknown> & { id: string; token: string };

const matches = (row: StoredLink, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, value]) => row[key] === value);

const buildTrackingLinkStore = () => {
  const rows: StoredLink[] = [];
  return {
    rows,
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((row) => matches(row, where)) ?? null),
    findUnique: jest.fn(async ({ where }: { where: { token: string } }) =>
      rows.find((row) => row.token === where.token) ?? null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row: StoredLink = {
        ...data,
        id: `link-${rows.length + 1}`,
        token: String(data.token),
        createdAt: new Date('2026-10-02T12:00:00Z'),
        updatedAt: new Date('2026-10-02T12:00:00Z'),
      };
      rows.push(row);
      return row;
    }),
  };
};

const buildApp = async (trackingLink: ReturnType<typeof buildTrackingLinkStore>) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { trackingLink } as any);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
};

const createLink = (app: FastifyInstance, options: { as?: string; originalUrl: string }) =>
  app.inject({
    method: 'POST',
    url: '/tracking-links',
    headers: options.as ? { 'x-test-user': options.as } : {},
    payload: { originalUrl: options.originalUrl },
  });

describe('POST /tracking-links — reuse is scoped to the caller (#9184)', () => {
  let app: FastifyInstance;
  let store: ReturnType<typeof buildTrackingLinkStore>;

  beforeEach(async () => {
    store = buildTrackingLinkStore();
    app = await buildApp(store);
  });
  afterEach(async () => { await app.close(); });

  it('creates a distinct link for a second account citing the same URL', async () => {
    const first = await createLink(app, { as: 'alice', originalUrl: 'https://meeshy.me' });
    const second = await createLink(app, { as: 'lea', originalUrl: 'https://meeshy.me' });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.existed).toBeUndefined();
    expect(second.json().data.trackingLink.createdBy).toBe('lea');
    expect(second.json().data.trackingLink.token).not.toBe(first.json().data.trackingLink.token);
    expect(store.rows.map((row) => row.createdBy)).toEqual(['alice', 'lea']);
  });

  it('never hands another user\'s click counters to the caller', async () => {
    await createLink(app, { as: 'alice', originalUrl: 'https://meeshy.me' });
    store.rows[0].totalClicks = 42;
    store.rows[0].uniqueClicks = 17;

    const response = await createLink(app, { as: 'lea', originalUrl: 'https://meeshy.me' });

    expect(response.json().data.trackingLink.totalClicks).toBe(0);
    expect(response.json().data.trackingLink.uniqueClicks).toBe(0);
  });

  it('still reuses the caller\'s own active link for the same URL', async () => {
    const first = await createLink(app, { as: 'lea', originalUrl: 'https://meeshy.me' });
    const again = await createLink(app, { as: 'lea', originalUrl: 'https://meeshy.me' });

    expect(again.statusCode).toBe(200);
    expect(again.json().data.existed).toBe(true);
    expect(again.json().data.trackingLink.token).toBe(first.json().data.trackingLink.token);
    expect(store.rows).toHaveLength(1);
  });

  it('gives an anonymous caller a link of its own, never a registered user\'s', async () => {
    const alice = await createLink(app, { as: 'alice', originalUrl: 'https://meeshy.me' });
    const visitor = await createLink(app, { originalUrl: 'https://meeshy.me' });

    expect(visitor.statusCode).toBe(201);
    expect(visitor.json().data.trackingLink.token).not.toBe(alice.json().data.trackingLink.token);
    expect(visitor.json().data.trackingLink.createdBy).toBeUndefined();
  });

  it('gives each anonymous caller a link of its own, never another visitor\'s', async () => {
    const first = await createLink(app, { originalUrl: 'https://meeshy.me' });
    const second = await createLink(app, { originalUrl: 'https://meeshy.me' });

    expect(second.statusCode).toBe(201);
    expect(second.json().data.trackingLink.token).not.toBe(first.json().data.trackingLink.token);
  });
});
