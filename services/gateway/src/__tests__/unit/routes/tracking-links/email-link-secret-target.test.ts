/**
 * UN LIEN SUIVI NE VISE JAMAIS UN LIEN À JETON D'E-MAIL (#10871).
 *
 * Tout compte pouvait créer `/l/<jeton>` vers
 * `https://meeshy.me/auth/magic-link?token=<son jeton>` : les apps publiées
 * réanalysaient la cible en lien universel et connectaient le lecteur au compte
 * du créateur, et `GET /l/:token` y redirigeait le navigateur. Les clients à
 * jour refusent ces cibles (#10870) ; la passerelle les refuse à la création,
 * à l'édition, et ne les SERT plus — y compris pour les liens déjà créés.
 *
 * Le service est le VRAI `TrackingLinkService` : seule la base est doublée.
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
import { TrackingLinkService } from '../../../../services/TrackingLinkService';

const MAGIC = 'https://meeshy.me/auth/magic-link?token=attacker-secret';

type Row = Record<string, unknown>;

const linkRow = (overrides: Row = {}): Row => ({
  id: 'link-1',
  token: 'fixate1',
  targetType: 'EXTERNAL',
  targetId: null,
  originalUrl: MAGIC,
  shortUrl: '/l/fixate1',
  createdBy: 'mallory',
  conversationId: null,
  messageId: null,
  totalClicks: 0,
  uniqueClicks: 0,
  isActive: true,
  expiresAt: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  lastClickedAt: null,
  ...overrides,
});

const buildPrisma = (initial: Row[] = []) => {
  const rows: Row[] = [...initial];
  const byToken = (where: { token?: string }) => rows.find((row) => row.token === where.token) ?? null;
  const trackingLink = {
    rows,
    findUnique: jest.fn(async ({ where }: { where: { token?: string } }) => byToken(where)),
    findFirst: jest.fn(async () => null),
    create: jest.fn(async ({ data }: { data: Row }) => {
      const row = { ...linkRow(), ...data, id: `link-${rows.length + 1}` };
      rows.push(row);
      return row;
    }),
    update: jest.fn(async ({ where, data }: { where: { token?: string; id?: string }; data: Row }) => {
      const row = rows.find((r) => r.token === where.token || r.id === where.id);
      if (!row) throw new Error('not found');
      const applied = Object.fromEntries(
        Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => {
            const increment = (value as { increment?: number } | null)?.increment;
            return [key, typeof increment === 'number' ? Number(row[key] ?? 0) + increment : value];
          }),
      );
      Object.assign(row, applied);
      return row;
    }),
  };
  const trackingLinkClick = {
    create: jest.fn(async ({ data }: { data: Row }) => ({ id: 'click-1', ...data })),
    findFirst: jest.fn(async () => null),
    count: jest.fn(async () => 0),
  };
  const conversationShareLink = { findFirst: jest.fn(async () => null) };
  return { trackingLink, trackingLinkClick, conversationShareLink };
};

const buildApp = async (prisma: ReturnType<typeof buildPrisma>) => {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as any);
  app.decorate('authenticate', async () => undefined);
  await registerCreationRoutes(app);
  await registerTrackingRoutes(app);
  await app.ready();
  return app;
};

const SECRET_TARGETS = [
  MAGIC,
  'https://meeshy.me/auth/email-link/magic-link#token=abc',
  'https://meeshy.me/reset-password?via=email#token=abc',
  'https://meeshy.me/auth/verify-email?token=abc',
  'https://meeshy.me/auth/revoke-sessions?token=abc',
  'https://meeshy.me/account/deletion?token=abc',
  'https://meeshy.me/settings/verify-email-change?token=abc',
  'https://meeshy.me//AUTH/Magic-Link/?token=abc',
  'https://meeshy.me/auth%2Fmagic-link?token=abc',
  'https://meeshy.me/auth/magic-link%20?token=abc',
  'https://meeshy.me/auth/%E3%80%80magic-link?token=abc',
  'https://meeshy.me/auth/verify-email/x?token=abc&email=a%40b.c',
  'https://meeshy.me/auth/magic-link;x=1?token=abc',
];

describe('POST /tracking-links — une cible porteuse d’un secret d’e-mail est refusée (#10871)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma();
    app = await buildApp(prisma);
  });
  afterEach(async () => { await app.close(); });

  it.each(SECRET_TARGETS)('refuse %s en 400 typé, sans rien écrire', async (originalUrl) => {
    const response = await app.inject({
      method: 'POST', url: '/tracking-links', headers: { 'x-test-as': 'mallory' }, payload: { originalUrl },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe('TRACKING_TARGET_CARRIES_EMAIL_SECRET');
    expect(JSON.stringify(body)).not.toContain('abc');
    expect(JSON.stringify(body)).not.toContain('attacker-secret');
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
    expect(prisma.trackingLink.rows).toHaveLength(0);
  });

  it('refuse une adresse que Foundation et WHATWG lisent sur deux hôtes (\\@), sans rien écrire', async () => {
    const response = await app.inject({
      method: 'POST', url: '/tracking-links', headers: { 'x-test-as': 'mallory' },
      payload: { originalUrl: 'https://evil.example\\@meeshy.me/auth/magic-link?token=attacker-secret' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('attacker-secret');
    expect(prisma.trackingLink.rows).toHaveLength(0);
  });

  it('crée toujours un lien vers une adresse ordinaire', async () => {
    const response = await app.inject({
      method: 'POST', url: '/tracking-links', headers: { 'x-test-as': 'alice' },
      payload: { originalUrl: 'https://example.com/promo?token=campaign' },
    });

    expect(response.statusCode).toBe(201);
    expect(prisma.trackingLink.rows).toHaveLength(1);
  });
});

describe('PATCH /tracking-links/:token — l’édition ne rouvre pas la porte (#10871)', () => {
  it('refuse de repointer un lien vers un lien magique', async () => {
    const prisma = buildPrisma([linkRow({ originalUrl: 'https://example.com/a', createdBy: 'mallory' })]);
    const app = await buildApp(prisma);

    const response = await app.inject({
      method: 'PATCH', url: '/tracking-links/fixate1', headers: { 'x-test-as': 'mallory' },
      payload: { originalUrl: MAGIC },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe('TRACKING_TARGET_CARRIES_EMAIL_SECRET');
    expect(prisma.trackingLink.update).not.toHaveBeenCalled();
    expect(prisma.trackingLink.rows[0]?.originalUrl).toBe('https://example.com/a');
    await app.close();
  });
});

describe('un lien DÉJÀ créé vers un lien à jeton n’est plus servi (#10871)', () => {
  let app: FastifyInstance;
  let prisma: ReturnType<typeof buildPrisma>;

  beforeEach(async () => {
    prisma = buildPrisma([linkRow()]);
    app = await buildApp(prisma);
  });
  afterEach(async () => { await app.close(); });

  it('GET /l/:token ne redirige pas : lien mort, sans clic compté', async () => {
    const response = await app.inject({ method: 'GET', url: '/l/fixate1' });

    expect(response.statusCode).toBe(410);
    expect(response.headers.location).toBeUndefined();
    expect(response.json().error).toBe('LINK_INACTIVE');
    expect(response.body).not.toContain('attacker-secret');
    expect(prisma.trackingLinkClick.create).not.toHaveBeenCalled();
  });

  it('POST /tracking-links/:token/click ne rend pas la cible', async () => {
    const response = await app.inject({ method: 'POST', url: '/tracking-links/fixate1/click', payload: {} });

    expect(response.statusCode).toBe(410);
    expect(response.json().error).toBe('LINK_INACTIVE');
    expect(response.body).not.toContain('attacker-secret');
    expect(prisma.trackingLinkClick.create).not.toHaveBeenCalled();
  });

  it('GET /tracking-links/:token/resolve répond un lien inactif sans cible', async () => {
    const response = await app.inject({ method: 'GET', url: '/tracking-links/fixate1/resolve' });

    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.isActive).toBe(false);
    expect(data.originalUrl).toBeNull();
    expect(response.body).not.toContain('attacker-secret');
  });

  it('un lien dont Foundation lit l’hôte autrement que WHATWG est mort (\\@)', async () => {
    prisma.trackingLink.rows.push(linkRow({
      id: 'link-3', token: 'differ1', originalUrl: 'https://evil.example\\@meeshy.me/auth/magic-link?token=attacker-secret',
    }));

    const redirect = await app.inject({ method: 'GET', url: '/l/differ1' });
    const resolved = await app.inject({ method: 'GET', url: '/tracking-links/differ1/resolve' });

    expect(redirect.statusCode).toBe(410);
    expect(resolved.json().data.isActive).toBe(false);
    expect(resolved.body).not.toContain('attacker-secret');
  });

  it('la forme SERVIE est la forme JUGÉE : la sérialisation WHATWG, jamais l’adresse brute', async () => {
    prisma.trackingLink.rows.push(linkRow({ id: 'link-4', token: 'canon01', originalUrl: 'https://evil.example\\@meeshy.me/x y' }));

    const redirect = await app.inject({ method: 'GET', url: '/l/canon01' });
    const resolved = await app.inject({ method: 'GET', url: '/tracking-links/canon01/resolve' });
    const click = await app.inject({ method: 'POST', url: '/tracking-links/canon01/click', payload: {} });

    expect(redirect.statusCode).toBe(302);
    expect(redirect.headers.location).toBe('https://evil.example/@meeshy.me/x%20y');
    expect(resolved.json().data.originalUrl).toBe('https://evil.example/@meeshy.me/x%20y');
    expect(click.json().data.originalUrl).toBe('https://evil.example/@meeshy.me/x%20y');
    expect(click.json().data.trackingLink.originalUrl).toBe('https://evil.example/@meeshy.me/x%20y');
  });

  it('GET /tracking-links/:token d’un lien SANS propriétaire ne rend pas la cible secrète', async () => {
    prisma.trackingLink.rows.push(linkRow({ id: 'link-5', token: 'orphan1', createdBy: null }));

    const response = await app.inject({ method: 'GET', url: '/tracking-links/orphan1' });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain('attacker-secret');
  });

  it('un lien suivi vers /login?next=<page à jeton> est mort', async () => {
    prisma.trackingLink.rows.push(linkRow({
      id: 'link-6', token: 'nextto1', originalUrl: 'https://meeshy.me/login?next=%2Fauth%2Fmagic-link%3Ftoken%3Dattacker-secret',
    }));

    const response = await app.inject({ method: 'GET', url: '/l/nextto1' });

    expect(response.statusCode).toBe(410);
    expect(response.body).not.toContain('attacker-secret');
  });

  it('un lien ordinaire reste servi (redirection 302)', async () => {
    prisma.trackingLink.rows.push(linkRow({ id: 'link-2', token: 'normal1', originalUrl: 'https://example.com/a' }));

    const response = await app.inject({ method: 'GET', url: '/l/normal1' });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('https://example.com/a');
  });
});

describe('TrackingLinkService — aucun chemin de création ne mint ces cibles (#10871)', () => {
  it('createTrackingLink lève sans écrire', async () => {
    const prisma = buildPrisma();
    const service = new TrackingLinkService(prisma as any);

    await expect(service.createTrackingLink({ originalUrl: MAGIC, createdBy: 'mallory' })).rejects.toThrow();
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });

  it('le suivi automatique des URL d’un contenu laisse ces URL sans lien suivi', async () => {
    const prisma = buildPrisma();
    const service = new TrackingLinkService(prisma as any);

    const links = await service.collectContentTrackingLinks({
      content: `regarde ${MAGIC} et https://example.com/a`,
      createdBy: 'mallory',
    });

    expect(links.map((link) => link.url)).toEqual(['https://example.com/a']);
    expect(prisma.trackingLink.rows.map((row) => row.originalUrl)).toEqual(['https://example.com/a']);
  });

  it('la réécriture explicite <url> laisse le lien à jeton tel quel', async () => {
    const prisma = buildPrisma();
    const service = new TrackingLinkService(prisma as any);

    const { trackingLinks } = await service.processExplicitLinksInContent({
      content: `<${MAGIC}> <https://evil.example\\@meeshy.me/auth/magic-link?token=x>`, conversationId: '507f1f77bcf86cd799439011', createdBy: 'mallory',
    });

    expect(trackingLinks).toHaveLength(0);
    expect(prisma.trackingLink.create).not.toHaveBeenCalled();
  });
});
