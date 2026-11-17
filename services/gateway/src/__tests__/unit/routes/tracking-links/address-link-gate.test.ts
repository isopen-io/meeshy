/**
 * Le lien de suivi d'une ADRESSE de fiche (#18863) ne se résout qu'à son audience.
 *
 * `/l/<jeton>` d'une adresse est la même adresse que la fiche sert au cercle choisi : un
 * jeton recopié ne doit pas l'ouvrir à qui la fiche la refuse. Masquée, supprimée, remplacée
 * (jeton tourné), d'un compte purgé, ou lue hors du cercle : `/tracking-links/:token/resolve`,
 * `/l/:token` et `POST /tracking-links/:token/click` rendent EXACTEMENT la réponse d'un jeton
 * inconnu, et ne comptent rien. Sans compte, seul un lien d'adresse PUBLIQUE se résout.
 *
 * Le service est le VRAI `TrackingLinkService` : seule la base et la loi des cercles sont doublées.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../services/engagement/EngagementService', () => ({
  EngagementService: jest.fn().mockImplementation(() => ({
    recordActivity: jest.fn(() => Promise.resolve()),
    recordLinkVisit: jest.fn(() => Promise.resolve()),
  })),
}));

jest.mock('../../../../middleware/admin-permissions.middleware', () => ({
  requireAnalyticsPermission: async () => undefined,
}));

let levels: Record<string, string> = {};
jest.mock('../../../../services/relations/profileCircleView', () => ({
  readProfileCircleView: async (_p: unknown, params: { viewerId: string }) => ({ level: levels[params.viewerId] ?? 'PUBLIC' }),
}));

const registeredContext = (id: string) => ({
  type: 'user' as const,
  isAuthenticated: true,
  isAnonymous: false,
  userId: id,
  hasFullAccess: true,
  registeredUser: { id, username: id, role: 'USER' },
});

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
      req.authContext = typeof as === 'string' && as.length > 0 ? registeredContext(as) : noSessionContext;
    }),
  };
});

import { registerCreationRoutes } from '../../../../routes/tracking-links/creation';
import { registerTrackingRoutes } from '../../../../routes/tracking-links/tracking';

const OWNER = '507f1f77bcf86cd799439011';
const FRIEND = '507f1f77bcf86cd7994390aa';
const ACQUAINTANCE = '507f1f77bcf86cd7994390bb';
const BLOCKED = '507f1f77bcf86cd7994390cc';
const ADDRESS_ID = '65a000000000000000000001';
const URL = 'https://ma-banque.fr/';

type Row = Record<string, unknown>;

const linkRow = (overrides: Row = {}): Row => ({
  id: 'link-1', token: 'adrtok', targetType: 'EXTERNAL', targetId: null, originalUrl: URL, shortUrl: '/l/adrtok',
  name: 'Banque', createdBy: OWNER, addressId: ADDRESS_ID, conversationId: null, messageId: null,
  totalClicks: 0, uniqueClicks: 0, isActive: true, expiresAt: null,
  createdAt: new Date('2026-11-01T00:00:00Z'), updatedAt: new Date('2026-11-01T00:00:00Z'), lastClickedAt: null,
  ...overrides,
});

type Address = { id: string; userId: string; url: string; circle: string; isShown: boolean; trackingToken: string | null };

const state = {
  links: [] as Row[],
  addresses: [] as Address[],
  clicks: [] as Row[],
  owner: { isActive: true, deletedAt: null as Date | null, deactivatedAt: null as Date | null } as Row | null,
  blockedByOwner: [] as string[],
};

const buildPrisma = () => ({
  trackingLink: {
    findUnique: jest.fn(async ({ where }: { where: { token: string } }) => state.links.find((l) => l.token === where.token) ?? null),
    findFirst: jest.fn(async () => null),
    update: jest.fn(async ({ where, data }: { where: { id?: string; token?: string }; data: Row }) => {
      const row = state.links.find((l) => l.id === where.id || l.token === where.token)!;
      if ((data.totalClicks as { increment?: number } | undefined)?.increment) row.totalClicks = Number(row.totalClicks) + 1;
      return row;
    }),
  },
  trackingLinkClick: {
    create: jest.fn(async ({ data }: { data: Row }) => { const click = { id: `click-${state.clicks.length + 1}`, ...data }; state.clicks.push(click); return click; }),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
  },
  profileAddress: {
    findFirst: jest.fn(async ({ where }: { where: { id: string; userId?: string } }) =>
      state.addresses.find((a) => a.id === where.id && (where.userId === undefined || a.userId === where.userId)) ?? null),
  },
  user: {
    findUnique: jest.fn(async ({ where }: { where: { id: string } }) =>
      (where.id === OWNER && state.owner ? { id: OWNER, username: 'aissa', displayName: 'Aissa', avatar: null, ...state.owner } : null)),
    findFirst: jest.fn(async ({ where }: { where: { id: string; blockedUserIds?: { has: string } } }) =>
      (where.id === OWNER && where.blockedUserIds && state.blockedByOwner.includes(where.blockedUserIds.has) ? { id: OWNER } : null)),
  },
  conversationShareLink: { findFirst: jest.fn(async () => null) },
});

let app: FastifyInstance;

beforeEach(async () => {
  levels = { [FRIEND]: 'FRIEND', [ACQUAINTANCE]: 'ACQUAINTANCE', [BLOCKED]: 'BLOOD' };
  state.links = [linkRow()];
  state.addresses = [{ id: ADDRESS_ID, userId: OWNER, url: URL, circle: 'FRIEND', isShown: true, trackingToken: 'adrtok' }];
  state.clicks = [];
  state.owner = { isActive: true, deletedAt: null, deactivatedAt: null };
  state.blockedByOwner = [];
  app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma() as never);
  app.decorate('authenticate', async () => undefined);
  await registerCreationRoutes(app);
  await registerTrackingRoutes(app);
  await app.ready();
});
afterEach(async () => { await app.close(); });

const asViewer = (viewer?: string) => (viewer ? { 'x-test-as': viewer } : {});
const resolve = (token: string, viewer?: string) => app.inject({ method: 'GET', url: `/tracking-links/${token}/resolve`, headers: asViewer(viewer) });
const redirect = (token: string, viewer?: string) => app.inject({ method: 'GET', url: `/l/${token}`, headers: asViewer(viewer) });
const click = (token: string, viewer?: string) => app.inject({ method: 'POST', url: `/tracking-links/${token}/click`, headers: asViewer(viewer), payload: {} });

/** Les trois portes rendent, au statut et au corps près, la réponse d'un jeton qui n'existe pas. */
async function expectUnknown(viewer?: string) {
  const [r, l, c] = await Promise.all([resolve('adrtok', viewer), redirect('adrtok', viewer), click('adrtok', viewer)]);
  const [ur, ul, uc] = await Promise.all([resolve('inconnu', viewer), redirect('inconnu', viewer), click('inconnu', viewer)]);
  expect([r.statusCode, r.json()]).toEqual([ur.statusCode, ur.json()]);
  expect([l.statusCode, l.json()]).toEqual([ul.statusCode, ul.json()]);
  expect([c.statusCode, c.json()]).toEqual([uc.statusCode, uc.json()]);
  for (const res of [r, l, c]) {
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('ma-banque');
    expect(res.body).not.toContain('Banque');
    expect(res.body).not.toContain('aissa');
  }
  expect(state.clicks).toEqual([]);
}

async function expectOpen(viewer?: string) {
  const r = await resolve('adrtok', viewer);
  expect(r.statusCode).toBe(200);
  expect(r.json().data.originalUrl).toBe(URL);
  const l = await redirect('adrtok', viewer);
  expect(l.statusCode).toBe(302);
  expect(l.headers.location).toBe(URL);
  expect((await click('adrtok', viewer)).statusCode).toBe(200);
  expect(state.clicks).toHaveLength(2);
}

describe('un lien d’adresse ne se résout qu’à l’audience de l’adresse', () => {
  it('cercle Ami : un lecteur Ami la résout, la suit et la compte', async () => {
    await expectOpen(FRIEND);
  });

  it('cercle Ami : un lecteur sans compte reçoit la réponse d’un jeton inconnu', async () => {
    await expectUnknown();
  });

  it('cercle Ami : un lecteur Connaissance (sous le cercle) reçoit la réponse d’un jeton inconnu', async () => {
    await expectUnknown(ACQUAINTANCE);
  });

  it('cercle Ami : un lecteur que le propriétaire a bloqué reçoit la réponse d’un jeton inconnu', async () => {
    state.blockedByOwner = [BLOCKED];
    await expectUnknown(BLOCKED);
  });

  it('adresse masquée : même un lecteur Ami reçoit la réponse d’un jeton inconnu', async () => {
    state.addresses[0].isShown = false;
    await expectUnknown(FRIEND);
  });

  it('adresse supprimée : même un lecteur Ami reçoit la réponse d’un jeton inconnu', async () => {
    state.addresses = [];
    await expectUnknown(FRIEND);
  });

  it('jeton tourné (l’adresse porte un autre jeton) : l’ancien ne se résout plus', async () => {
    state.addresses[0].trackingToken = 'nouveau';
    await expectUnknown(FRIEND);
  });

  it('destination du lien changée hors de l’adresse : il ne se résout plus', async () => {
    state.links[0].originalUrl = 'https://ailleurs.example/';
    await expectUnknown(FRIEND);
  });

  it('compte du propriétaire purgé ou désactivé : la réponse d’un jeton inconnu', async () => {
    state.owner = null;
    await expectUnknown(FRIEND);
    state.owner = { isActive: true, deletedAt: null, deactivatedAt: new Date('2026-11-10') };
    await expectUnknown(FRIEND);
  });

  it('cercle Public : un lecteur sans compte la résout', async () => {
    state.addresses[0].circle = 'PUBLIC';
    await expectOpen();
  });

  it('un lien qui n’est pas celui d’une adresse garde son comportement', async () => {
    state.links = [linkRow({ addressId: undefined, token: 'postlk' })];
    state.addresses = [];
    expect((await resolve('postlk')).statusCode).toBe(200);
    expect((await redirect('postlk')).statusCode).toBe(302);
  });
});
