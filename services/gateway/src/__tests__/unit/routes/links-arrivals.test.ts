/**
 * `GET /links/:linkId/arrivals` — la liste COMPLÈTE des arrivées d'un lien
 * d'invitation, page par page (#7813).
 *
 * Mêmes lecteurs que les statistiques (`loadShareLinkForManagement`, la vraie
 * règle) ; la vraie sérialisation est exercée : une arrivée ne sort qu'avec
 * nom, badge sans compte, pays, langue et date — ce que la ligne PORTE à côté
 * (visage, identifiant, présence, IP, e-mail) ne part pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = (req as unknown as { _testAuthContext: unknown })._testAuthContext;
  }),
  isRegisteredUser: jest.fn((ctx: { registeredUser?: unknown } | null) => ctx?.registeredUser != null),
}));

import { registerLinkStatsRoutes } from '../../../routes/links/stats';
import { decodeArrivalsCursor, encodeArrivalsCursor } from '../../../services/conversations/shareLinkArrivals';

const CREATOR_ID = '507f1f77bcf86cd799439011';
const MODERATOR_ID = '507f1f77bcf86cd799439012';
const STRANGER_ID = '507f1f77bcf86cd799439013';
const LINK_DB_ID = '507f1f77bcf86cd799439022';
const LINK_ID = 'mshy_abc123';
const CONV_ID = '507f1f77bcf86cd799439033';

type Row = Record<string, unknown>;

const rowId = (n: number) => `68a0000000000000000000${String(n).padStart(2, '0')}`;

const arrivalRow = (n: number, overrides: Row = {}): Row => ({
  id: rowId(n), type: 'anonymous', displayName: `invité ${n}`, language: 'fr',
  joinedAt: new Date(Date.UTC(2026, 8, 24, 10, 0, 0) - n * 60_000), joinCountry: 'FR', user: null,
  ...overrides,
});

function fakePrisma(options: { readonly memberRole?: string; readonly caller?: string; readonly rows?: readonly Row[] } = {}) {
  const participantFindMany = jest.fn(async (args: { take: number }) => (options.rows ?? []).slice(0, args.take));
  const prisma = {
    conversationShareLink: {
      findFirst: jest.fn(async () => ({
        id: LINK_DB_ID, linkId: LINK_ID, createdBy: CREATOR_ID, conversationId: CONV_ID,
        conversation: {
          id: CONV_ID,
          participants: options.memberRole ? [{ userId: options.caller, role: options.memberRole, isActive: true }] : [],
        },
      })),
    },
    participant: { findMany: participantFindMany },
  };
  return { prisma, participantFindMany };
}

async function buildApp(prisma: unknown, caller: string | null) {
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma as never);
  app.addHook('onRequest', async (req: FastifyRequest) => {
    (req as unknown as { _testAuthContext: unknown })._testAuthContext = caller
      ? { isAuthenticated: true, isAnonymous: false, userId: caller, registeredUser: { id: caller, role: 'USER' } }
      : null;
  });
  await registerLinkStatsRoutes(app);
  await app.ready();
  return app;
}

const getArrivals = (app: FastifyInstance, query = '') => app.inject({ method: 'GET', url: `/links/${LINK_ID}/arrivals${query}` });

describe('arrivées d’un lien — qui peut les lire', () => {
  it('l’auteur du lien les lit', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await getArrivals(app)).statusCode).toBe(200);
    await app.close();
  });

  it('un modérateur de la conversation les lit', async () => {
    const { prisma } = fakePrisma({ memberRole: 'moderator', caller: MODERATOR_ID });
    const app = await buildApp(prisma, MODERATOR_ID);

    expect((await getArrivals(app)).statusCode).toBe(200);
    await app.close();
  });

  it('un simple membre reçoit 403, et rien n’est lu', async () => {
    const { prisma, participantFindMany } = fakePrisma({ memberRole: 'member', caller: STRANGER_ID });
    const app = await buildApp(prisma, STRANGER_ID);

    const res = await getArrivals(app);

    expect(res.statusCode).toBe(403);
    expect(res.body).not.toContain('invité');
    expect(participantFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('un inconnu sans rôle dans la conversation reçoit 403', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, STRANGER_ID);

    expect((await getArrivals(app)).statusCode).toBe(403);
    expect(participantFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('un lien inconnu rend 404', async () => {
    const { prisma } = fakePrisma();
    prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null as never);
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await getArrivals(app)).statusCode).toBe(404);
    await app.close();
  });

  it('sans compte, 403', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, null);

    expect((await getArrivals(app)).statusCode).toBe(403);
    expect(participantFindMany).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('arrivées d’un lien — ce qui part', () => {
  it('une arrivée dit qui, avec ou sans compte, d’où, dans quelle langue, et quand', async () => {
    const { prisma } = fakePrisma({
      rows: [
        arrivalRow(1),
        arrivalRow(2, { type: 'user', displayName: 'Ana', language: 'en', joinCountry: null, user: { systemLanguage: 'pt-BR' } }),
      ],
    });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getArrivals(app)).json().data;

    expect(data.arrivals).toEqual([
      { displayName: 'invité 1', isAnonymous: true, country: 'FR', language: 'fr', joinedAt: '2026-09-24T09:59:00.000Z' },
      { displayName: 'Ana', isAnonymous: false, country: null, language: 'pt', joinedAt: '2026-09-24T09:58:00.000Z' },
    ]);
    await app.close();
  });

  it('rien de ce que la ligne porte à côté ne part : ni identifiant, ni visage, ni présence, ni IP, ni e-mail', async () => {
    const { prisma } = fakePrisma({
      rows: [arrivalRow(1, {
        avatar: '/api/v1/attachments/file/nova.png',
        isOnline: true,
        lastActiveAt: new Date(),
        ipAddress: '203.0.113.7',
        userId: '507f1f77bcf86cd799439099',
        user: { systemLanguage: 'fr', email: 'nova@example.org', avatar: '/a.png', isOnline: true },
      })],
    });
    const app = await buildApp(prisma, CREATOR_ID);

    const res = await getArrivals(app);
    const [arrival] = res.json().data.arrivals;

    expect(Object.keys(arrival).sort()).toEqual(['country', 'displayName', 'isAnonymous', 'joinedAt', 'language']);
    for (const leak of [rowId(1), 'nova.png', '/a.png', 'isOnline', 'lastActiveAt', '203.0.113.7', 'nova@example.org', '507f1f77bcf86cd799439099']) {
      expect(res.body).not.toContain(leak);
    }
    await app.close();
  });

  it('la lecture est fermée : elle ne charge que les colonnes servies', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await getArrivals(app);

    const args = participantFindMany.mock.calls[0]?.[0] as unknown as { select: Record<string, unknown> };
    expect(args.select).toEqual({
      id: true, type: true, displayName: true, language: true, joinedAt: true, joinCountry: true,
      user: { select: { systemLanguage: true } },
    });
    await app.close();
  });
});

describe('arrivées d’un lien — les pages', () => {
  it('lit les arrivées du lien seul, les plus récentes d’abord, ordre total par identifiant', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    await getArrivals(app);

    expect(participantFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { shareLinkId: LINK_DB_ID },
      orderBy: [{ joinedAt: 'desc' }, { id: 'desc' }],
      take: 31,
    }));
    await app.close();
  });

  it('la dernière page rend un curseur nul', async () => {
    const { prisma } = fakePrisma({ rows: [arrivalRow(1), arrivalRow(2)] });
    const app = await buildApp(prisma, CREATOR_ID);

    const data = (await getArrivals(app)).json().data;

    expect(data.arrivals).toHaveLength(2);
    expect(data.nextCursor).toBeNull();
    await app.close();
  });

  it('une page pleine rend le curseur de sa DERNIÈRE arrivée, et la suivante repart strictement après elle', async () => {
    const rows = [1, 2, 3].map((n) => arrivalRow(n));
    const { prisma, participantFindMany } = fakePrisma({ rows });
    const app = await buildApp(prisma, CREATOR_ID);

    const first = (await getArrivals(app, '?limit=2')).json().data;

    expect(first.arrivals.map((a: { displayName: string }) => a.displayName)).toEqual(['invité 1', 'invité 2']);
    expect(first.nextCursor).toBe(encodeArrivalsCursor({ joinedAt: rows[1].joinedAt as Date, id: rowId(2) }));

    await getArrivals(app, `?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);

    const joinedAt = rows[1].joinedAt as Date;
    expect(participantFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        shareLinkId: LINK_DB_ID,
        OR: [{ joinedAt: { lt: joinedAt } }, { joinedAt, id: { lt: rowId(2) } }],
      },
      take: 3,
    }));
    await app.close();
  });

  it('un curseur illisible rend 400 sans rien lire', async () => {
    const { prisma, participantFindMany } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    const res = await getArrivals(app, '?cursor=pas-un-curseur');

    expect(res.statusCode).toBe(400);
    expect(participantFindMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('une taille de page hors bornes rend 400', async () => {
    const { prisma } = fakePrisma();
    const app = await buildApp(prisma, CREATOR_ID);

    expect((await getArrivals(app, '?limit=0')).statusCode).toBe(400);
    expect((await getArrivals(app, '?limit=101')).statusCode).toBe(400);
    await app.close();
  });
});

describe('curseur des arrivées', () => {
  it('fait l’aller-retour', () => {
    const position = { joinedAt: new Date('2026-09-24T10:00:00.123Z'), id: rowId(7) };
    expect(decodeArrivalsCursor(encodeArrivalsCursor(position))).toEqual(position);
  });

  it('refuse ce qui n’est pas un curseur', () => {
    for (const raw of ['', 'abc', Buffer.from('12:zz').toString('base64url'), Buffer.from(`x:${rowId(1)}`).toString('base64url')]) {
      expect(decodeArrivalsCursor(raw)).toBeNull();
    }
  });
});
