/**
 * `POST /conversations/join/:linkId` — #4353.
 *
 * Cette route est désormais un ADAPTATEUR MINCE vers `performLinkJoin()`
 * (`routes/conversations/link-admission.ts`, le cœur partagé livré par
 * #4167) : la loi d'admission UNIQUE (`admitLinkEntry`) y est évaluée pour
 * cette porte AUSSI. Avant ce lot, cette route ne contrôlait que `isActive`
 * et `expiresAt` — ni `maxUses`, ni `maxConcurrentUsers`, ni
 * `maxUniqueSessions`, ni `allowedIpRanges`, ni `requireAccount`, et son
 * incrément de `currentUses` n'était pas atomique. Conséquence mesurée :
 * pour le MÊME lien, à la MÊME seconde, un utilisateur INSCRIT entrait là où
 * un INVITÉ était refusé.
 *
 * Ce fichier traverse la VRAIE sérialisation (`app.inject()`, schémas
 * partagés NON mockés — cf. « un témoin qui n'exerce pas la sérialisation
 * atteste un contrat que personne ne respecte », `services/gateway/CLAUDE.md`)
 * et exerce le VRAI `performLinkJoin()` / `admitLinkEntry()` : ni l'un ni
 * l'autre n'est mocké. C'est la seule façon de prouver que CETTE route
 * littérale — et pas seulement la loi qu'elle appelle — refuse un lien
 * épuisé : #4167 avait déjà posé ce témoin sur le chemin canonique et sur la
 * loi pure, jamais ici, et c'est précisément dans cet espace que le défaut a
 * survécu.
 *
 * Extrait de `conversation-sharing.test.ts` (#4353) — cette route y était
 * testée contre l'ANCIEN corps (mocks au grain des appels Prisma internes,
 * remplacés en bloc par la délégation). L'intention de chaque témoin
 * (`canViewHistory` figé, rejoin sur SA ligne, notifications best-effort,
 * clôture du fil, avis d'arrivée) est reprise ici ; la mécanique de test
 * change pour suivre le nouveau corps.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

import { registerSharingRoutes } from '../../../routes/conversations/sharing';
import { registerLinkAdmissionRoutes } from '../../../routes/conversations/link-admission';

// ─── Constantes ─────────────────────────────────────────────────────────────

const LINK_ID = 'mshy_link_abc123';
const SHARE_LINK_DB_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const USER_ID = '507f1f77bcf86cd799439044';
const ADMIN_ID = '507f1f77bcf86cd799439099';
const PART_ID = '507f1f77bcf86cd799439077';

const mockShareLink = {
  id: SHARE_LINK_DB_ID, linkId: LINK_ID, identifier: 'test-link',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  maxUniqueSessions: null, currentUniqueSessions: 0,
  requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false,
  allowedCountries: [], allowedLanguages: [], allowedIpRanges: [],
  allowAnonymousMessages: true, allowAnonymousFiles: false, allowAnonymousImages: false,
  allowViewHistory: false,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group', isActive: true, closedAt: null },
};

/** Pose `authContext` comme le ferait `createUnifiedAuthMiddleware` pour un JWT valide (`type: 'user'`). */
async function fakeRequiredAuth(request: FastifyRequest): Promise<void> {
  const userId = (request.headers['x-test-user-id'] as string | undefined) || USER_ID;
  (request as any).authContext = {
    type: 'user', isAuthenticated: true, isAnonymous: false,
    userId, displayName: 'Ana', userLanguage: 'fr', hasFullAccess: true, canSendMessages: true,
    registeredUser: { id: userId, role: 'USER' },
  };
}

/** La porte invitée (`optionalAuth`) : sans créance, `authContext` reste `undefined` — S1. */
async function noopOptionalAuth(): Promise<void> {}

function buildDefaultPrisma() {
  return {
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue(mockShareLink),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: USER_ID, displayName: 'Ana Registered', username: 'ana',
        email: 'ana@example.com', systemLanguage: 'fr', avatar: null,
      }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      findMany: jest.fn<any>().mockResolvedValue([]), // resolveConversationEntry — vide = primo-arrivant
      create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: PART_ID, avatar: null, ...data })),
      update: jest.fn<any>().mockImplementation(async ({ data }: any) => ({ id: PART_ID, avatar: null, ...data })),
    },
    message: { create: jest.fn<any>().mockResolvedValue({ id: 'sys-1' }) },
  };
}

/** `POST /conversations/:id/invite` (même fichier, route NON touchée par #4353) déclare `onRequest: [fastify.authenticate]` — un décorateur posé ailleurs en production. Sans lui, `registerSharingRoutes` lève à l'ENREGISTREMENT, avant même d'atteindre la route qui nous intéresse. */
function decorateAuthenticate(app: FastifyInstance): void {
  app.decorate('authenticate', fakeRequiredAuth as never);
}

/**
 * La branche `already-member` de `joinAsRegistered` relit la ligne PAR ID
 * (`participant.findUnique`) après que `resolveConversationEntry`
 * (`participant.findMany`) l'a désignée, et fige `canViewHistory` depuis
 * `permissions` (`resolveEntryRights`) : les DEUX doubles doivent porter la
 * MÊME ligne, `permissions` comprise, sous peine de tomber sur le repli
 * fail-closed « État de participation introuvable » (409) au lieu du succès
 * `already-member` attendu.
 */
function mockAlreadyMember(app: FastifyInstance): void {
  const row = {
    id: PART_ID, userId: USER_ID, isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01'),
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
  };
  (app as any).prisma.participant.findMany.mockResolvedValueOnce([row]);
  (app as any).prisma.participant.findUnique.mockResolvedValueOnce(row);
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildDefaultPrisma() as never);
  decorateAuthenticate(app);
  registerSharingRoutes(app as never, (app as any).prisma, noopOptionalAuth, fakeRequiredAuth);
  // Enregistrée sur le MÊME app, avec le MÊME `prisma` : c'est ce qui rend le
  // témoin de SYMÉTRIE possible — les deux portes lisent le même lien.
  registerLinkAdmissionRoutes(app as never, (app as any).prisma, noopOptionalAuth, noopOptionalAuth);
  await app.ready();
  return app;
}

const postJoin = (app: FastifyInstance, linkId: string = LINK_ID, headers: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: `/conversations/join/${linkId}`, headers });

const postGuestJoin = (app: FastifyInstance, key: string = LINK_ID) =>
  app.inject({ method: 'POST', url: `/links/${key}/members`, payload: { nickname: 'Guest' } });

// ─────────────────────────────────────────────────────────────────────────────
// Refus portant sur le LIEN — préservés à l'identique
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — refus sur le lien', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('404 quand le lien est introuvable', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const res = await postJoin(app);
    expect(res.statusCode).toBe(404);
  });

  it('410 quand le lien est inactif', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, isActive: false });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(410);
  });

  it('410 quand le lien est expiré', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, expiresAt: new Date(0) });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(410);
  });

  it("n'expire pas quand `expiresAt` est dans le futur", async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, expiresAt: new Date(Date.now() + 86400000) });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
  });

  it('accepte `identifier` en plus de `linkId` (format de partage iOS)', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockClear();
    await postJoin(app, 'mshy_test_identifier');
    expect((app as any).prisma.conversationShareLink.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ linkId: 'mshy_test_identifier' }, { identifier: 'mshy_test_identifier' }]),
        }),
      })
    );
  });

  // #4353 — cette route devient un ADAPTATEUR MINCE vers `POST
  // /links/:key/members`, comme les trois routes-sœurs de `anonymous.ts`
  // (#4167) : elle annonce désormais son successeur, y compris sur un refus
  // (`onRequest` court avant `requiredAuth`) — l'appelant qui échoue est
  // celui qui a le plus besoin de savoir migrer.
  it('porte les en-têtes de dépréciation (Deprecation, Link) — succès ET refus', async () => {
    const ok = await postJoin(app);
    expect(ok.headers['deprecation']).toMatch(/^@\d+$/);
    expect(ok.headers['link']).toBe(`</api/v1/links/${LINK_ID}/members>; rel="successor-version"`);

    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    const notFound = await postJoin(app);
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['deprecation']).toMatch(/^@\d+$/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Refus portant sur ce vers quoi le lien POINTE — une clôture n'éteint aucun
// lien de partage : un lien qui circule reste joignable après la mort du fil,
// et c'est cette route (authentifiée) qui gardait déjà correctement ce cas
// AVANT #4353. Préservé.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — conversation close', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it("n'écrit AUCUNE ligne Participant quand la conversation visée est close (closedAt)", async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-03-01') },
    });

    const res = await postJoin(app);

    expect(res.statusCode).toBe(410);
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('refuse aussi sur `isActive: false` seul — le lien reste actif, la conversation non', async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: null },
    });

    const res = await postJoin(app);

    expect(res.statusCode).toBe(410);
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('CONTRE-ÉPREUVE — une conversation vivante laisse la jointure aboutir', async () => {
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: true, closedAt: null },
    });

    const res = await postJoin(app);

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.participant.create).toHaveBeenCalledTimes(1);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // #4351 — LE MOTIF, pas seulement le statut. Les deux témoins ci-dessus (et
  // leur pendant `symétrie` plus bas) n'assertaient que `statusCode` ou une
  // ÉGALITÉ mutuelle entre invité/inscrit — jamais la VALEUR littérale que
  // `sendError(reply, result.refusal.status, result.refusal.code, {message})`
  // sert. Deux refus IDENTIQUEMENT vides passeraient les deux témoins
  // existants. C'est exactement ce que le critère 5 de #4351 reproche côté
  // invité : « le refus ne dit pas pourquoi ». Ici, il le prouve OU le
  // dément — pour l'appelant INSCRIT de CETTE porte, qui délègue déjà à
  // `performLinkJoin`/`admitLinkEntry` (#4353).
  // ───────────────────────────────────────────────────────────────────────────

  it('410 — le corps nomme la RAISON : code CONVERSATION_CLOSED et message clair (closedAt)', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-03-01') },
    });

    const res = await postJoin(app);
    const body = res.json();

    expect(res.statusCode).toBe(410);
    expect(body.success).toBe(false);
    expect(body.error).toBe('CONVERSATION_CLOSED');
    expect(body.message).toBe('Cette conversation est terminée');
  });

  it('410 — même motif quand seul `isActive: false` porte la clôture (pas de `closedAt`)', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink,
      conversation: { ...mockShareLink.conversation, isActive: false, closedAt: null },
    });

    const res = await postJoin(app);
    const body = res.json();

    expect(res.statusCode).toBe(410);
    expect(body.error).toBe('CONVERSATION_CLOSED');
    expect(body.message).toBe('Cette conversation est terminée');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #4353 — LE DÉFAUT DE TÊTE, prouvé sur la route LITTÉRALE
//
// #4167 a posé son témoin `maxUses` sur le chemin canonique et sur la loi
// pure, JAMAIS sur cette route — c'est exactement l'espace où le défaut a
// survécu. Le poser ici est le seul geste qui le ferme réellement.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — maxUses (#4353, TDD : ce bloc tombait avant le correctif)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('409 LINK_EXHAUSTED quand `maxUses` est atteint — côté INSCRIT', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 1, currentUses: 1 });
    (app as any).prisma.participant.create.mockClear();

    const res = await postJoin(app);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
    // Un témoin d'écriture assert sur l'EFFET, jamais sur le statut seul :
    // aucune ligne Participant n'a le droit d'exister pour un refus.
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
  });

  it('409 LINK_EXHAUSTED quand `maxConcurrentUsers` est atteint — côté INSCRIT', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({
      ...mockShareLink, maxConcurrentUsers: 5, currentConcurrentUsers: 5,
    });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
  });

  it("l'incrément de `currentUses` passe par un `updateMany` gardé par le WHERE — critère 3 de #4167, sur CETTE porte", async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 3 });
    (app as any).prisma.conversationShareLink.updateMany.mockClear();
    (app as any).prisma.conversationShareLink.update.mockClear();

    const res = await postJoin(app);

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.conversationShareLink.updateMany).toHaveBeenCalledWith({
      where: { id: SHARE_LINK_DB_ID, OR: [{ maxUses: null }, { currentUses: { lt: 5 } }] },
      data: { currentUses: { increment: 1 } },
    });
    // L'ancien corps appelait `update` — plus aucun appelant ne doit le faire
    // pour cette écriture : deux exemplaires de l'incrément seraient la
    // recopie de police que #4167 ferme.
    expect((app as any).prisma.conversationShareLink.update).not.toHaveBeenCalled();
  });

  // LA COURSE PERDUE — le témoin qui compte le plus. Le verdict d'admission
  // (lu à `currentUses: 3 < maxUses: 5`) est FAVORABLE ; entre ce verdict et
  // l'écriture, une requête concurrente a pris la dernière place. `updateMany`
  // le revérifie à l'EXÉCUTION et rend `count: 0` : la jointure est refusée
  // MALGRÉ un verdict d'admission accordé, et `currentUses` n'avance que d'UN
  // (celui du gagnant, jamais rejoué ici).
  it('perd la course : verdict favorable puis écriture concurrente ⇒ 409, `currentUses` n\'avance que d\'UN', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, maxUses: 5, currentUses: 3 });
    (app as any).prisma.conversationShareLink.updateMany.mockClear();
    (app as any).prisma.conversationShareLink.updateMany.mockResolvedValueOnce({ count: 0 });
    (app as any).prisma.participant.create.mockClear();

    const res = await postJoin(app);

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('LINK_EXHAUSTED');
    // L'EFFET, pas seulement le code : aucune ligne Participant écrite pour
    // le perdant de la course, et une seule tentative d'incrément (celle qui
    // vient de rendre count:0 — jamais rejouée en boucle).
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
    expect((app as any).prisma.conversationShareLink.updateMany).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// requireAccount / allowedIpRanges — le comportement que la loi dicte
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — requireAccount et allowedIpRanges', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it("`requireAccount` n'affecte PAS un inscrit — il a déjà un compte", async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, requireAccount: true });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
  });

  it("403 REGION_NOT_ALLOWED quand l'IP de l'appelant n'est dans aucune plage autorisée", async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedIpRanges: ['10.0.0.0/8'] });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe('REGION_NOT_ALLOWED');
  });

  it("n'est jamais bloqué par `allowedCountries` — critère 5 de #4167, retiré de la loi", async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowedCountries: ['US'] });
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// #4353 — LA SYMÉTRIE : le témoin qui grave le défaut de fond.
//
// Le MÊME lien, dans le MÊME état, doit rendre le MÊME code de refus à un
// invité (`POST /links/:key/members`, sans créance) et à un inscrit (`POST
// /conversations/join/:linkId`). Une divergence ici EST le défaut que #4353
// ferme — avant ce lot, un inscrit passait là où l'invité était refusé.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — symétrie invité/inscrit (#4353)', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('lien ÉPUISÉ : même code (LINK_EXHAUSTED, 409) pour un invité et pour un inscrit', async () => {
    const exhausted = { ...mockShareLink, maxUses: 1, currentUses: 1 };
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(exhausted);
    const guestRes = await postGuestJoin(app);

    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(exhausted);
    const registeredRes = await postJoin(app);

    expect(guestRes.statusCode).toBe(registeredRes.statusCode);
    expect(guestRes.json().error).toBe(registeredRes.json().error);
    expect(guestRes.statusCode).toBe(409);
    expect(guestRes.json().error).toBe('LINK_EXHAUSTED');
  });

  it("IP hors plage autorisée : même code (REGION_NOT_ALLOWED, 403) des deux côtés", async () => {
    const restricted = { ...mockShareLink, allowedIpRanges: ['10.0.0.0/8'] };
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(restricted);
    const guestRes = await postGuestJoin(app);

    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(restricted);
    const registeredRes = await postJoin(app);

    expect(guestRes.statusCode).toBe(registeredRes.statusCode);
    expect(guestRes.json().error).toBe(registeredRes.json().error);
  });

  it('conversation CLOSE : même code (CONVERSATION_CLOSED, 410) des deux côtés', async () => {
    const closed = { ...mockShareLink, conversation: { ...mockShareLink.conversation, isActive: false, closedAt: new Date('2026-01-01') } };
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(closed);
    const guestRes = await postGuestJoin(app);

    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(closed);
    const registeredRes = await postJoin(app);

    expect(guestRes.statusCode).toBe(registeredRes.statusCode);
    expect(guestRes.json().error).toBe(registeredRes.json().error);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Forme de réponse — { message, conversationId }, préservée
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — forme de réponse', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('200 — rend exactement `{ message, conversationId }`, rien de plus', async () => {
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(Object.keys(body.data).sort()).toEqual(['conversationId', 'message']);
    expect(typeof body.data.message).toBe('string');
    expect(body.data.conversationId).toBe(CONV_ID);
  });

  it('déjà membre — même forme `{ message, conversationId }`', async () => {
    mockAlreadyMember(app);
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Object.keys(body.data).sort()).toEqual(['conversationId', 'message']);
    expect(body.data.message).toMatch(/déjà membre/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// canViewHistory figé au join, rejoin sur SA ligne — comportement de
// `resolveConversationEntry` / `REJOIN_PARTICIPANT_STATE`, inchangé par
// #4353 mais désormais appliqué DEPUIS le cœur partagé.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — canViewHistory et rejoin', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('fige `canViewHistory` depuis le lien à la création de la ligne — lien fermé', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowViewHistory: false });
    (app as any).prisma.participant.create.mockClear();
    await postJoin(app);
    expect((app as any).prisma.participant.create.mock.calls[0][0].data.permissions.canViewHistory).toBe(false);
  });

  it('fige `canViewHistory` depuis le lien à la création de la ligne — lien ouvert', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce({ ...mockShareLink, allowViewHistory: true });
    (app as any).prisma.participant.create.mockClear();
    await postJoin(app);
    expect((app as any).prisma.participant.create.mock.calls[0][0].data.permissions.canViewHistory).toBe(true);
  });

  it('réintègre un ancien membre SUR SA LIGNE (rejoin) — jamais une seconde ligne', async () => {
    (app as any).prisma.participant.findMany.mockResolvedValueOnce([
      { id: PART_ID, userId: USER_ID, isActive: false, bannedAt: null, joinedAt: new Date('2026-01-01'), historyVisibleFrom: new Date('2025-06-01') },
    ]);
    (app as any).prisma.participant.create.mockClear();
    (app as any).prisma.participant.update.mockClear();

    const res = await postJoin(app);

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.participant.create).not.toHaveBeenCalled();
    const written = (app as any).prisma.participant.update.mock.calls[0][0];
    expect(written.where).toEqual({ id: PART_ID });
    expect(written.data.isActive).toBe(true);
    // L'octroi d'historique de la venue PRÉCÉDENTE est effacé : il PRIME sur
    // le rang/droits remis à zéro, une ligne périmée ne doit pas décider seule
    // de ce que le revenant lit.
    expect(written.data.historyVisibleFrom).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// PIÈGE 1 — préservé TEL QUEL : auto-jonction Socket.IO + notifications.
// Ni l'un ni l'autre ne relève de la loi d'admission ; les perdre en
// simplifiant serait une régression SILENCIEUSE.
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — préservé : auto-jonction Socket.IO et notifications', () => {
  function buildAppWithSockets() {
    return (async () => {
      const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
      app.decorate('prisma', buildDefaultPrisma() as never);
      decorateAuthenticate(app);
      const joinUserToConversationRoom = jest.fn<any>().mockResolvedValue(undefined);
      const broadcastMessage = jest.fn<any>().mockResolvedValue(undefined);
      (app as any).socketIOHandler = { getManager: () => ({ joinUserToConversationRoom, broadcastMessage }) };
      const createMemberJoinedNotification = jest.fn<any>().mockResolvedValue(undefined);
      const createMemberJoinedNotificationsBatch = jest.fn<any>().mockResolvedValue(0);
      (app as any).notificationService = { createMemberJoinedNotification, createMemberJoinedNotificationsBatch };
      registerSharingRoutes(app as never, (app as any).prisma, noopOptionalAuth, fakeRequiredAuth);
      await app.ready();
      return { app, joinUserToConversationRoom, createMemberJoinedNotification, createMemberJoinedNotificationsBatch };
    })();
  }

  it("auto-joint les sockets connectés de l'arrivant à la room de conversation", async () => {
    const { app, joinUserToConversationRoom } = await buildAppWithSockets();
    await postJoin(app);
    expect(joinUserToConversationRoom).toHaveBeenCalledWith(USER_ID, CONV_ID);
    await app.close();
  });

  it("N'auto-joint PAS quand la personne était déjà membre — personne n'est entré", async () => {
    const { app, joinUserToConversationRoom } = await buildAppWithSockets();
    mockAlreadyMember(app);
    await postJoin(app);
    expect(joinUserToConversationRoom).not.toHaveBeenCalled();
    await app.close();
  });

  it('notifie les admins/créateurs de la conversation, une seule diffusion groupée', async () => {
    const { app, createMemberJoinedNotification, createMemberJoinedNotificationsBatch } = await buildAppWithSockets();
    (app as any).prisma.participant.findMany
      // 1er appel : `resolveConversationEntry` (aucune ligne préexistante).
      .mockResolvedValueOnce([])
      // 2e appel : les admins/créateurs à notifier.
      .mockResolvedValueOnce([{ userId: ADMIN_ID }]);

    const res = await postJoin(app);

    expect(res.statusCode).toBe(200);
    expect(createMemberJoinedNotification).toHaveBeenCalledTimes(1);
    expect(createMemberJoinedNotification).toHaveBeenCalledWith(expect.objectContaining({ recipientUserId: USER_ID }));
    expect(createMemberJoinedNotificationsBatch).toHaveBeenCalledWith(
      [ADMIN_ID],
      { newMemberUserId: USER_ID, conversationId: CONV_ID, joinMethod: 'via_link' }
    );
    await app.close();
  });

  it("ne bloque pas la jointure quand le service de notification est absent", async () => {
    const { app } = await buildAppWithSockets();
    (app as any).notificationService = undefined;
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('ne bloque pas la jointure quand la notification lève', async () => {
    const { app, createMemberJoinedNotification } = await buildAppWithSockets();
    createMemberJoinedNotification.mockRejectedValueOnce(new Error('notif DB error'));
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Avis d'arrivée dans le fil — posé PAR le cœur partagé (`joinAsRegistered`),
// plus par cette route : la rejouer ici la doublerait.
// ─────────────────────────────────────────────────────────────────────────────

describe("POST /conversations/join/:linkId — avis d'arrivée", () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it("annonce l'arrivée de l'inscrit dans le fil, une seule fois", async () => {
    (app as any).prisma.message.create.mockClear();
    await postJoin(app);
    expect((app as any).prisma.message.create).toHaveBeenCalledTimes(1);
    const { data } = (app as any).prisma.message.create.mock.calls[0][0];
    expect(data).toMatchObject({ conversationId: CONV_ID, messageType: 'system' });
    expect(data.metadata).toMatchObject({ kind: 'member-joined', isAnonymous: false, viaShareLink: true });
  });

  it("n'annonce rien quand la personne était déjà membre — personne n'est entré", async () => {
    (app as any).prisma.message.create.mockClear();
    mockAlreadyMember(app);
    await postJoin(app);
    expect((app as any).prisma.message.create).not.toHaveBeenCalled();
  });

  it("n'annonce rien quand le lien est refusé", async () => {
    (app as any).prisma.message.create.mockClear();
    (app as any).prisma.conversationShareLink.findFirst.mockResolvedValueOnce(null);
    await postJoin(app);
    expect((app as any).prisma.message.create).not.toHaveBeenCalled();
  });

  it("l'entrée reste acquise si l'avis ne peut pas s'écrire", async () => {
    (app as any).prisma.message.create.mockRejectedValueOnce(new Error('mongo down'));
    const res = await postJoin(app);
    expect(res.statusCode).toBe(200);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Panne interne — préservée
// ─────────────────────────────────────────────────────────────────────────────

describe('POST /conversations/join/:linkId — panne interne', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('500 sur exception inattendue', async () => {
    (app as any).prisma.conversationShareLink.findFirst.mockRejectedValueOnce(new Error('DB down'));
    const res = await postJoin(app);
    expect(res.statusCode).toBe(500);
  });
});
