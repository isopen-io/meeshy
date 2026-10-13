/**
 * #10437 — un invité dont le lien de partage a EXPIRÉ perd toute lecture et
 * toute écriture REST, par la résolution de sa session — pas route par route.
 *
 * Avant : `SHARE_LINK_EXPIRED` n'était posé que sur quatre lectures (fil,
 * recherche, épinglés, fil de réponses). L'invité au lien échu lisait encore
 * les réactions, le détail de la conversation, et ÉCRIVAIT. La résolution de
 * session anonyme (`middleware/auth.ts`) est la seule porte que toutes ses
 * requêtes traversent : elle relit le lien et refuse, avec le MÊME code que les
 * quatre routes (`SHARE_LINK_EXPIRED`, 403) — rétrocompatible pour les clients
 * qui le branchent déjà.
 *
 * Le double de Prisma JUGE chaque `where` contre des documents (une ligne
 * participant, des liens) : le témoin dit ce que la requête APPARIE, pas sa
 * forme.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../utils/logger', () => ({
  logger: { child: () => ({ warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() }), warn: jest.fn() },
  logError: jest.fn(),
}));

import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { hashSessionToken } from '../../../utils/session-token';

const JETON = 'jeton-de-session-invite';
const LINK_ID = '507f1f77bcf86cd799439033';
const PAST = new Date('2026-01-01T00:00:00Z');
const FUTURE = new Date('2099-01-01T00:00:00Z');

function guest(extra: MongoDocument = {}): MongoDocument {
  return {
    id: '507f1f77bcf86cd799439011',
    conversationId: '507f1f77bcf86cd799439022',
    type: 'anonymous',
    sessionTokenHash: hashSessionToken(JETON),
    displayName: 'Invité',
    avatar: null,
    role: 'MEMBER',
    language: 'fr',
    permissions: null,
    isActive: true,
    isOnline: false,
    lastActiveAt: new Date(),
    nickname: null,
    shareLinkId: LINK_ID,
    anonymousSession: { shareLinkId: LINK_ID, profile: { username: 'invite' } },
    ...extra,
  };
}

type World = {
  readonly participants: MongoDocument[];
  readonly links: MongoDocument[];
  readonly linkReadFails?: boolean;
};

async function sonde(world: World, requireAuth = true): Promise<FastifyInstance> {
  const prisma = {
    user: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userSession: { findFirst: jest.fn<any>().mockResolvedValue(null), update: jest.fn<any>() },
    participant: {
      findFirst: jest.fn<any>(async ({ where }: { where: MongoDocument }) =>
        world.participants.find((row) => matchesMongoWhere(row, where)) ?? null
      ),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }),
    },
    conversationShareLink: {
      findUnique: jest.fn<any>(async ({ where }: { where: MongoDocument }) => {
        if (world.linkReadFails) throw new Error('mongo down');
        return world.links.find((row) => matchesMongoWhere(row, where)) ?? null;
      }),
    },
  } as any;

  const app = Fastify({ logger: false });
  app.get(
    '/sonde',
    { preValidation: [createUnifiedAuthMiddleware(prisma, { requireAuth, allowAnonymous: true })] },
    async (request, reply) => reply.send({ ok: true, auth: (request as any).authContext?.isAuthenticated === true })
  );
  await app.ready();
  return app;
}

async function call(app: FastifyInstance) {
  const res = await app.inject({ method: 'GET', url: '/sonde', headers: { 'x-session-token': JETON } });
  await app.close();
  return res;
}

describe('Invité au lien expiré — la session se ferme à la résolution (#10437)', () => {
  it('refuse en 403 SHARE_LINK_EXPIRED un invité dont le lien a expiré', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [{ id: LINK_ID, expiresAt: PAST }] }));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ success: false, code: 'SHARE_LINK_EXPIRED' });
  });

  it('refuse aussi sur une route à authentification FACULTATIVE — pas de repli silencieux en visiteur', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [{ id: LINK_ID, expiresAt: PAST }] }, false));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'SHARE_LINK_EXPIRED' });
  });

  it('lit le lien de la COLONNE de la participation, la session embarquée en repli', async () => {
    const res = await call(
      await sonde({
        participants: [guest({ shareLinkId: undefined, anonymousSession: { shareLinkId: LINK_ID } })],
        links: [{ id: LINK_ID, expiresAt: PAST }],
      })
    );

    expect(res.statusCode).toBe(403);
  });

  it('admet un invité dont le lien est vivant', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [{ id: LINK_ID, expiresAt: FUTURE }] }));

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, auth: true });
  });

  it('admet un invité dont le lien n’a pas d’échéance', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [{ id: LINK_ID }] }));

    expect(res.statusCode).toBe(200);
  });

  // #10492 — la règle du fil (« un lien introuvable ne ferme rien ») tenait
  // tant que chaque suppression de lien révoquait ses invités ; une purge qui
  // en laissait derrière elle leur gardait l'accès. L'invité qui survit à son
  // lien est désormais refusé ici, par la garde commune.
  it('un lien INTROUVABLE refuse l’invité qui lui survit — 410 GUEST_ACCESS_REVOKED', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [] }));

    expect(res.statusCode).toBe(410);
  });

  it('ne sert rien quand le lien est illisible — fail-closed', async () => {
    const res = await call(await sonde({ participants: [guest()], links: [], linkReadFails: true }));

    expect(res.statusCode).toBe(401);
  });
});

/**
 * #10457 — l'ordre unique des causes (`guestAccessEnd`) : le REST jugeait la
 * participation avant le lien, la relecture du minuteur le lien avant la
 * participation. Le même invité lisait « accès retiré » ou « lien expiré »
 * selon le chemin. Le lien expiré est la cause première : c'est lui qui fait
 * désactiver l'invité par le balayage.
 */
describe('Invité au lien expiré ET à la participation morte — une seule cause, sur le REST comme ailleurs (#10457)', () => {
  it('lien échu et participation désactivée ⇒ 403 SHARE_LINK_EXPIRED, pas 410 GUEST_ACCESS_REVOKED', async () => {
    const res = await call(await sonde({ participants: [guest({ isActive: false })], links: [{ id: LINK_ID, expiresAt: PAST }] }));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'SHARE_LINK_EXPIRED' });
  });

  it('lien échu et participation bannie ⇒ 403 SHARE_LINK_EXPIRED', async () => {
    const res = await call(await sonde({ participants: [guest({ bannedAt: PAST })], links: [{ id: LINK_ID, expiresAt: PAST }] }));

    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ code: 'SHARE_LINK_EXPIRED' });
  });

  it('lien vivant et participation désactivée ⇒ 410 GUEST_ACCESS_REVOKED', async () => {
    const res = await call(await sonde({ participants: [guest({ isActive: false })], links: [{ id: LINK_ID, expiresAt: FUTURE }] }));

    expect(res.statusCode).toBe(410);
    expect(res.json()).toMatchObject({ error: 'GUEST_ACCESS_REVOKED' });
  });

  it('lien illisible et participation désactivée ⇒ refus SANS code de fin d’accès : un accroc de la base ne coûte pas la session', async () => {
    const res = await call(await sonde({ participants: [guest({ isActive: false })], links: [], linkReadFails: true }));

    expect(res.statusCode).toBe(401);
    expect(res.body).not.toContain('GUEST_ACCESS_REVOKED');
    expect(res.body).not.toContain('SHARE_LINK_EXPIRED');
  });
});
