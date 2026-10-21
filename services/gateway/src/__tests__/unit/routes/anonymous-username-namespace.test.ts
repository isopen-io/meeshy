/**
 * Le pseudo d'un anonyme ne doit jamais être une raison de le REFUSER.
 *
 * L'ancienne porte arbitrait une collision de pseudos par un 409. Pour un
 * inscrit c'est anodin — il se reconnecte, il en change. Pour un anonyme, ce
 * lien est sa seule identité et sa seule porte : un 409 est un refus définitif,
 * et il tombait pour une raison qui ne le concerne pas (un INSCRIT porte déjà
 * ce nom, quelque part, dans une autre conversation).
 *
 * Pire, la route calculait bien un `suggestedUsername` — dans deux boucles
 * `while (true)` — puis le jetait : `sendError(409, …)` ne le transportait pas,
 * alors que le web lit `result.suggestedNickname`. Le travail était fait et
 * perdu ; l'utilisateur voyait « pseudo déjà pris » sans alternative.
 *
 * Deux décisions remplacent l'arbitrage :
 *   1. Le pseudo d'un anonyme ne se compare plus à ceux des COMPTES. Ce qui
 *      distingue les deux populations n'est pas le nom mais le GLYPHE FANTÔME
 *      (`packages/shared/utils/anonymous-username.ts`), apposé au rendu devant
 *      le nom et le pseudo de tout participant sans compte. `ano_` reste un
 *      préfixe lisible, PAS un espace réservé : un compte peut s'appeler
 *      `ano_bob`, il n'aura simplement pas le fantôme.
 *   2. Tout pseudo anonyme, saisi ou automatique, se termine par un nombre
 *      de 2 à 5 chiffres (#10602) ; entre anonymes d'une même conversation,
 *      un nombre déjà porté se retire. On entre toujours ; c'est le pseudo qui
 *      s'adapte, pas la personne qu'on renvoie.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../utils/sanitize', () => ({
  SecuritySanitizer: {
    sanitizeText: jest.fn((s) => s),
    sanitizeUsername: jest.fn((s) => s),
  },
}));

jest.mock('../../../utils/session-token', () => ({
  hashSessionToken: jest.fn((token) => 'hashed-' + token),
  // #4167 — voir `anonymous.test.ts` : `generateSessionToken` est désormais
  // partagé (`utils/session-token.ts`), plus un double local de la route.
  generateSessionToken: jest.fn(() => 'anon_test_session_token'),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
  anonymousParticipantSchema: { type: 'object', additionalProperties: true },
  conversationLinkSchema: { type: 'object', additionalProperties: true },
  conversationMinimalSchema: { type: 'object', additionalProperties: true },
  userMinimalSchema: { type: 'object', additionalProperties: true },
}));

import { anonymousRoutes } from '../../../routes/anonymous';

const LINK_ID = 'mshy_link_abc123';
const CONV_ID = '507f1f77bcf86cd799439022';

const shareLink = {
  id: '507f1f77bcf86cd799439011', linkId: LINK_ID, identifier: 'test-link',
  conversationId: CONV_ID, isActive: true, expiresAt: null, maxUses: null,
  currentUses: 0, maxConcurrentUsers: null, currentConcurrentUsers: 0,
  currentUniqueSessions: 0, requireAccount: false, requireNickname: false,
  requireEmail: false, requireBirthday: false, allowedCountries: [],
  allowedLanguages: [], allowedIpRanges: [], allowAnonymousMessages: true,
  allowAnonymousFiles: false, allowAnonymousImages: false, allowViewHistory: false,
  conversation: { id: CONV_ID, title: 'Test Conv', type: 'group', isActive: true, closedAt: null },
};

type Prisma = {
  conversationShareLink: { findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
  user: { findFirst: jest.Mock };
  participant: { findFirst: jest.Mock; create: jest.Mock };
  message: { create: jest.Mock };
};

/**
 * Une instance Fastify par `describe`, jamais par test : `anonymous.test.ts`
 * porte la même contrainte, le coût mémoire d'un `buildApp()` par cas fait
 * tomber le runner en OOM.
 */
async function buildApp(): Promise<{ app: FastifyInstance; prisma: Prisma }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma: Prisma = {
    conversationShareLink: { findFirst: jest.fn<any>(), update: jest.fn<any>(), updateMany: jest.fn<any>() },
    user: { findFirst: jest.fn<any>() },
    participant: { findFirst: jest.fn<any>(), create: jest.fn<any>() },
    message: { create: jest.fn<any>() },
  };
  resetPrisma(prisma, shareLink);
  app.decorate('prisma', prisma as never);
  await anonymousRoutes(app);
  await app.ready();
  return { app, prisma };
}

function resetPrisma(prisma: Prisma, link: typeof shareLink): void {
  prisma.conversationShareLink.findFirst.mockReset().mockResolvedValue(link);
  prisma.conversationShareLink.update.mockReset().mockResolvedValue({});
  prisma.conversationShareLink.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prisma.user.findFirst.mockReset().mockResolvedValue(null);
  prisma.participant.findFirst.mockReset().mockResolvedValue(null);
  prisma.participant.create.mockReset().mockImplementation(async ({ data }: any) => ({
    id: 'participant-1', avatar: null, ...data,
  }));
  prisma.message.create.mockReset().mockResolvedValue({ id: 'msg-1' });
}

const NUMBERED_BOBBY = /^ano_bobby[1-9]\d{1,4}$/;

const join = (app: FastifyInstance, payload: Record<string, unknown>) =>
  app.inject({ method: 'POST', url: `/anonymous/join/${LINK_ID}`, payload });

describe('POST /anonymous/join/:linkId — espace de noms `ano_`', () => {
  let app: FastifyInstance;
  let prisma: Prisma;

  beforeAll(async () => { ({ app, prisma } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => { resetPrisma(prisma, shareLink); });

  it('écrit un pseudo de l’espace réservé, même quand aucun n’est demandé', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', language: 'fr' });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.participant.username).toMatch(/^ano_/);
  });

  it('préfixe aussi le pseudo CHOISI et le termine par 2 à 5 chiffres (#10602)', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.participant.username).toMatch(NUMBERED_BOBBY);
  });

  it('numérote aussi le pseudo automatique', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', language: 'fr' });

    expect(res.json().data.participant.username).toMatch(/^ano_bob_sm[1-9]\d{1,4}$/);
  });

  it('marque le participant lui-même, et la réponse sert le pseudo ÉCRIT', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    const created = prisma.participant.create.mock.calls[0][0] as any;
    expect(created.data.displayName).toMatch(NUMBERED_BOBBY);
    expect(created.data.anonymousSession.profile.username).toBe(created.data.displayName);
    expect(res.json().data.participant.username).toBe(created.data.displayName);
  });

  it('n’est plus refusé parce qu’un INSCRIT porte ce nom — le fantôme les distingue', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'other', username: 'bobby' });

    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.participant.username).toMatch(NUMBERED_BOBBY);
  });

  it('deux joignants qui saisissent le même nom entrent tous les deux, sous deux nombres', async () => {
    const first = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });
    const second = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    expect(first.json().data.participant.username).toMatch(NUMBERED_BOBBY);
    expect(second.json().data.participant.username).toMatch(NUMBERED_BOBBY);
  });

  it('tire un autre nombre quand celui tiré est déjà porté dans la conversation, sans refuser', async () => {
    const taken: string[] = [];
    prisma.participant.findFirst.mockImplementation(async ({ where }: any) => {
      if (taken.length >= 3) return null;
      taken.push(where.displayName);
      return { id: 'squatter' };
    });

    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(201);
    const written = (prisma.participant.create.mock.calls[0][0] as any).data.displayName;
    expect(written).toMatch(NUMBERED_BOBBY);
    expect(taken).not.toContain(written);
    taken.forEach((candidate) => expect(candidate).toMatch(NUMBERED_BOBBY));
  });

  it('ne cherche la place QUE dans la conversation visée', async () => {
    await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    const where = (prisma.participant.findFirst.mock.calls[0][0] as any).where;
    expect(where).toMatchObject({ conversationId: CONV_ID, type: 'anonymous' });
  });

  it('rend la main plutôt que de boucler quand tous les tirages sont pris', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: 'squatter' });

    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(409);
    expect(prisma.participant.findFirst.mock.calls.length).toBeLessThan(100);
  });

  it('transporte enfin la suggestion — elle était calculée puis jetée', async () => {
    prisma.participant.findFirst.mockResolvedValue({ id: 'squatter' });

    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.json().suggestedNickname).toMatch(/^ano_bob_sm[1-9]\d{1,4}$/);
  });
});

describe('POST /anonymous/join/:linkId — pseudo exigé par le lien', () => {
  let app: FastifyInstance;
  let prisma: Prisma;

  beforeAll(async () => { ({ app, prisma } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => { resetPrisma(prisma, { ...shareLink, requireNickname: true }); });

  it('admet un pseudo VIDE même quand le lien en exige un : la passerelle le nomme (directive 2026-10-13)', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', language: 'fr' });

    expect(res.statusCode).toBe(201);
  });

  it('accepte le pseudo exigé, replacé dans l’espace réservé', async () => {
    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(201);
    expect(res.json().data.participant.username).toMatch(NUMBERED_BOBBY);
  });
});

// ─── Avis d'arrivée ──────────────────────────────────────────────────────────
//
// Un anonyme entrait sans que personne ne le voie entrer. Les membres présents
// découvraient un inconnu au moment où il prenait la parole, et rien ne disait
// qu'il n'a PAS de compte — la distinction la plus utile quand la porte est un
// lien public que n'importe qui peut suivre.
//
// L'avis reste un ACCESSOIRE : sa panne ne renvoie pas quelqu'un déjà admis.

describe('POST /anonymous/join/:linkId — avis d’arrivée', () => {
  let app: FastifyInstance;
  let prisma: Prisma;

  beforeAll(async () => { ({ app, prisma } = await buildApp()); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => { resetPrisma(prisma, shareLink); });

  it('annonce l’arrivée dans le fil', async () => {
    await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    const { data } = prisma.message.create.mock.calls[0][0] as any;
    expect(data).toMatchObject({ conversationId: CONV_ID, messageType: 'system' });
  });

  it('dit que l’arrivant n’a pas de compte, et sous quel pseudo', async () => {
    await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    const { data } = prisma.message.create.mock.calls[0][0] as any;
    expect(data.metadata).toMatchObject({
      kind: 'member-joined',
      displayName: expect.stringMatching(NUMBERED_BOBBY),
      isAnonymous: true,
      viaShareLink: true,
    });
  });

  it('attribue l’avis au participant qui vient d’être créé', async () => {
    await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    const created = (prisma.participant.create.mock.results[0].value as any);
    const { data } = prisma.message.create.mock.calls[0][0] as any;
    await expect(created).resolves.toMatchObject({ id: data.senderId });
  });

  it('admet quand même le joignant si l’avis ne peut pas s’écrire', async () => {
    prisma.message.create.mockRejectedValue(new Error('mongo down'));

    const res = await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(res.statusCode).toBe(201);
  });

  it('n’annonce RIEN quand le lien est refusé — personne n’est entré', async () => {
    prisma.conversationShareLink.findFirst.mockResolvedValue({ ...shareLink, isActive: false });

    await join(app, { firstName: 'Bob', lastName: 'Smith', username: 'bobby', language: 'fr' });

    expect(prisma.message.create).not.toHaveBeenCalled();
  });
});
