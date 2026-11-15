/**
 * `POST /tracking-links` ne fabrique un lien suivi que pour un compte INSCRIT (#10291).
 *
 * Suite de #10286 : un invité anonyme ne reçoit plus de lien suivi sur ses
 * messages, mais il pouvait encore en FABRIQUER un lui-même par cette route
 * (`authOptional`), avec `customToken` compris, puis taper `m+<jeton>` dans un
 * message que les clients antérieurs rendent en lien Meeshy cliquable.
 *
 * Deux refus, discernables (#4792) : sans session ⇒ 401 `UNAUTHORIZED` ; session
 * d'invité (X-Session-Token) ⇒ 403 `REGISTERED_USER_REQUIRED`. Dans les deux
 * cas, RIEN n'est écrit — le témoin assert sur la base, pas seulement le statut.
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
  type: 'user' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId: id,
  hasFullAccess: true,
  registeredUser: { id, username: id, role: 'USER' },
});

const guestSessionContext = {
  type: 'anonymous' as const,
  isAuthenticated: true,
  isAnonymous: true,
  userId: 'participant-guest',
  participantId: 'participant-guest',
  hasFullAccess: false,
  anonymousUser: { id: 'participant-guest', username: 'guest' },
  registeredUser: undefined,
};

const noSessionContext = {
  type: 'anonymous' as const,
  isAuthenticated: false,
  isAnonymous: true,
  userId: undefined,
  hasFullAccess: false,
  anonymousUser: undefined,
  registeredUser: undefined,
};

jest.mock('../../../../middleware/auth', () => {
  const actual = jest.requireActual('../../../../middleware/auth') as Record<string, unknown>;
  return {
    ...actual,
    createUnifiedAuthMiddleware: jest.fn().mockReturnValue(async (req: any) => {
      const as = req.headers['x-test-as'];
      if (as === 'guest') req.authContext = guestSessionContext;
      else if (typeof as === 'string' && as.length > 0) req.authContext = registeredContext(as);
      else req.authContext = noSessionContext;
    }),
  };
});

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';

const buildStore = () => {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    findFirst: jest.fn(async () => null),
    findUnique: jest.fn(async () => null),
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const row = {
        ...data,
        id: `link-${rows.length + 1}`,
        createdAt: new Date('2026-10-12T12:00:00Z'),
        updatedAt: new Date('2026-10-12T12:00:00Z'),
      };
      rows.push(row);
      return row;
    }),
  };
};

const buildApp = async (trackingLink: ReturnType<typeof buildStore>) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', { trackingLink } as any);
  await registerCreationRoutes(app);
  await app.ready();
  return app;
};

const post = (app: FastifyInstance, as: string | undefined, payload: Record<string, unknown>) =>
  app.inject({
    method: 'POST',
    url: '/tracking-links',
    headers: as ? { 'x-test-as': as } : {},
    payload,
  });

describe('POST /tracking-links — reserved to registered accounts (#10291)', () => {
  let app: FastifyInstance;
  let store: ReturnType<typeof buildStore>;

  beforeEach(async () => {
    store = buildStore();
    app = await buildApp(store);
  });
  afterEach(async () => { await app.close(); });

  it('refuses a guest session with 403 REGISTERED_USER_REQUIRED and writes nothing', async () => {
    const response = await post(app, 'guest', { originalUrl: 'https://example.com/a' });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('REGISTERED_USER_REQUIRED');
    expect(typeof body.error).toBe('string');
    expect(store.create).not.toHaveBeenCalled();
    expect(store.rows).toHaveLength(0);
  });

  it('refuses a guest session asking for a custom token', async () => {
    const response = await post(app, 'guest', { originalUrl: 'https://example.com/a', customToken: 'promo1' });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe('REGISTERED_USER_REQUIRED');
    expect(store.rows).toHaveLength(0);
  });

  it('refuses a caller with no session at all with 401 UNAUTHORIZED and writes nothing', async () => {
    const response = await post(app, undefined, { originalUrl: 'https://example.com/a' });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe('UNAUTHORIZED');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('keeps the two refusals distinguishable', async () => {
    const none = await post(app, undefined, { originalUrl: 'https://example.com/a' });
    const guest = await post(app, 'guest', { originalUrl: 'https://example.com/a' });

    expect(none.statusCode).not.toBe(guest.statusCode);
    expect(none.json().code).not.toBe(guest.json().code);
  });

  it('still creates a link for a registered account (older clients keep working)', async () => {
    const response = await post(app, 'alice', { originalUrl: 'https://example.com/a' });

    expect(response.statusCode).toBe(201);
    expect(response.json().data.trackingLink.createdBy).toBe('alice');
    expect(store.rows).toHaveLength(1);
  });
});
