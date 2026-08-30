/**
 * Les TROIS portes d'entrée d'une conversation, face à la ligne `Participant`
 * qu'un départ ou un bannissement a laissée derrière.
 *
 * Un départ n'efface pas la ligne — il écrit `{ isActive: false, leftAt }` ; un
 * bannissement écrit en plus `bannedAt`. Les trois portes s'en accommodaient
 * différemment, et aucune ne la traitait :
 *
 *   - `POST /conversations/join/:linkId`     — cherchait SANS `isActive`, donc
 *                                              répondait « déjà membre » à un
 *                                              ancien membre et ne le
 *                                              réintégrait jamais.
 *   - `POST /conversations/:id/participants` — cherchait AVEC `isActive: true`,
 *                                              donc ne voyait pas le banni et
 *                                              lui **créait une ligne neuve**.
 *   - `POST /conversations/:id/invite`       — idem.
 *
 * Les deux dernières défont donc un bannissement sans passer par
 * `POST …/unban`, qui exige le rang `admin` là où `participants` s'ouvre aussi
 * aux `moderator`. Et comme `Participant` n'a aucune contrainte d'unicité sur
 * `(conversationId, userId)`, elles laissent une ligne en double derrière
 * elles.
 *
 * Les doubles Prisma de ce fichier DISCRIMINENT sur `isActive` et `bannedAt` :
 * un mock qui rend la même ligne quel que soit le `where` laisserait passer
 * exactement les défauts mesurés ici.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Mocks (hoistés) ──────────────────────────────────────────────────────────

const mockResolveConversationId = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => { reply._body = { success: true, data }; return reply; });
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendUnauthorized = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendConflict = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => { reply._body = { success: false, error: msg }; return reply; });
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => { reply._body = { success: false, status, error: msg }; return reply; });

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

// PROLONGER le module, jamais le REMPLACER (CLAUDE.md § « Un double PARTIEL
// d'un module perd en silence tout ce que le module GAGNE ») : un double qui
// énumère ses exports rend `undefined` au premier que le module gagne.
jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/identifier-generator') as object),
  generateUniqueShareLinkId: jest.fn<any>().mockResolvedValue('mshy_TestLnk1'),
  ensureUniqueShareLinkIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendUnauthorized: (...args: any[]) => mockSendUnauthorized(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      error: jest.fn<any>(), info: jest.fn<any>(), warn: jest.fn<any>(), debug: jest.fn<any>(),
    }),
  },
}));

jest.mock('../../../utils/participant-lookup-cache', () => ({
  invalidateParticipantLookup: jest.fn<any>(),
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: jest.fn<any>().mockReturnValue({
    filterPresenceForViewer: jest.fn<any>((_viewer: any, rows: any) => rows),
  }),
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn<any>(),
  sendErrorResponse: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationSchema: { type: 'object' },
  conversationParticipantSchema: { type: 'object' },
  conversationResponseSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

// ─── Imports après les mocks ──────────────────────────────────────────────────

import { registerSharingRoutes } from '../../../routes/conversations/sharing';
import { registerParticipantsRoutes } from '../../../routes/conversations/participants';

// ─── IDs ──────────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
/** L'appelant : celui qui rejoint (porte 1) ou l'admin qui ajoute (portes 2 et 3). */
const ACTOR_ID = '507f1f77bcf86cd799439022';
/** Celui qu'on fait entrer sur les portes 2 et 3. */
const TARGET_ID = '507f1f77bcf86cd799439033';
const LINK_ID = '507f1f77bcf86cd799439055';
const EXISTING_ROW_ID = '507f1f77bcf86cd799439066';
const ACTOR_ROW_ID = '507f1f77bcf86cd799439077';

// ─── État de la ligne laissée derrière ────────────────────────────────────────

type LeftoverState = 'none' | 'active' | 'departed' | 'banned';

function leftoverRow(state: Exclude<LeftoverState, 'none'>, userId: string) {
  // L'appelant des portes d'AJOUT doit porter un rang qui l'autorise ; sinon le
  // 403 de rang masquerait le 403 de bannissement qu'on mesure.
  const role = userId === ACTOR_ID ? 'admin' : 'member';
  const base = {
    id: userId === ACTOR_ID ? ACTOR_ROW_ID : EXISTING_ROW_ID, userId, conversationId: CONV_ID, role, joinedAt: new Date('2026-01-01'),
    // #4353 — la branche `already-member` de `joinAsRegistered` relit ce
    // champ (`resolveEntryRights`) pour figer `canViewHistory` : absent, il
    // lève sur un `undefined.canViewHistory`.
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
  };
  if (state === 'active') return { ...base, isActive: true, bannedAt: null };
  if (state === 'departed') return { ...base, isActive: false, bannedAt: null, leftAt: new Date('2026-02-01') };
  return { ...base, isActive: false, bannedAt: new Date('2026-02-01'), leftAt: new Date('2026-02-01') };
}

/**
 * Le double honore le `where` : une ligne `isActive: false` ne sort JAMAIS d'un
 * `where` qui exige `isActive: true`. C'est cette discrimination qui rend le
 * test capable de voir l'évasion de bannissement.
 */
function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.userId !== undefined && where.userId !== row.userId) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.bannedAt !== undefined) {
      const wantsBanned = where.bannedAt?.not === null;
      if (wantsBanned && row.bannedAt == null) return false;
      if (!wantsBanned && where.bannedAt === null && row.bannedAt != null) return false;
    }
    if (where?.role?.in !== undefined && !where.role.in.includes(row.role)) return false;
    return true;
  });
}

function buildPrisma(rows: any[]) {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async (args: any) => ({
        id: CONV_ID,
        type: 'group',
        title: 'Test',
        createdAt: new Date('2025-01-01'),
        participants: rowsMatching(rows, args?.include?.participants?.where).map((row) => ({
          id: row.id,
          userId: row.userId,
          role: row.role,
          user: { id: row.userId, username: 'u', role: 'USER' },
        })),
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>(async (args: any) => rowsMatching(rows, args?.where)[0] ?? null),
      // #4353 — la branche `already-member` de `joinAsRegistered` (le cœur
      // partagé de #4167) relit la ligne PAR ID avant de répondre : sans ce
      // double, elle lève sur une méthode absente du fake.
      findUnique: jest.fn<any>(async (args: any) => rows.find((row) => row.id === args?.where?.id) ?? null),
      findMany: jest.fn<any>(async (args: any) => rowsMatching(rows, args?.where)),
      create: jest.fn<any>(async (args: any) => ({ id: 'created-row', ...args?.data })),
      update: jest.fn<any>(async (args: any) => ({ id: args?.where?.id, ...args?.data })),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        id: TARGET_ID, username: 'target', displayName: 'Target', avatar: null, systemLanguage: 'fr',
      }),
      findFirst: jest.fn<any>().mockResolvedValue({
        id: TARGET_ID, username: 'target', displayName: 'Target', avatar: null, systemLanguage: 'fr',
      }),
    },
    conversationShareLink: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: LINK_ID, linkId: 'lnk', identifier: 'mshy_x', conversationId: CONV_ID,
        isActive: true, expiresAt: null, currentUses: 0,
        // #4353 — `POST /conversations/join/:linkId` traverse désormais
        // `admitLinkEntry` (#4167), qui LIT ces sept champs sur CHAQUE appel
        // (`allowedIpRanges.length` lève sur `undefined`) : les fournir tous,
        // au repos, pour que ce double reste un lien PASSANT par défaut.
        maxUses: null, maxConcurrentUsers: null, currentConcurrentUsers: 0,
        maxUniqueSessions: null, currentUniqueSessions: 0,
        allowedIpRanges: [], requireAccount: false, allowedLanguages: [],
        conversation: { id: CONV_ID, title: 'Test', type: 'group' },
      }),
      update: jest.fn<any>().mockResolvedValue({}),
      // La réclamation d'usage du lien (critère 3 de #4167) passe par un
      // `updateMany` gardé par le `WHERE`, plus par un simple `update` — sans
      // ce double, `claimLinkUse` lève sur une méthode absente du fake.
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
    },
    // L'avis d'arrivée écrit ici. `postJoinSystemMessage` ne rejette JAMAIS :
    // sans ce double il échouerait dans sa propre garde, et tout témoin de
    // câblage resterait vert sans rien prouver.
    message: {
      create: jest.fn<any>(async (args: any) => ({ id: 'sys-row', ...args?.data })),
    },
  };
  return prisma;
}

// ─── Harnais Fastify factice ──────────────────────────────────────────────────

type RouteReg = { method: string; path: string; handler: (req: any, reply: any) => Promise<any> };

function createMockFastify(prisma: any) {
  const routes: RouteReg[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });
  return {
    routes,
    prisma,
    notificationService: {
      createMemberJoinedNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
      createConversationInviteNotification: jest.fn<any>().mockResolvedValue(undefined),
      createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    },
    mentionService: { invalidateCacheForConversation: jest.fn<any>().mockResolvedValue(undefined) },
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue({ to: jest.fn<any>().mockReturnValue({ emit: jest.fn<any>() }) }),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
    get: register('GET'), post: register('POST'), patch: register('PATCH'), delete: register('DELETE'),
  };
}

function createMockReply() {
  const reply: any = { _body: undefined, status: jest.fn<any>(), send: jest.fn<any>((b: any) => { reply._body = b; return reply; }) };
  reply.status.mockReturnValue(reply);
  return reply;
}

function routeFor(fastify: any, method: string, fragment: string) {
  const found = fastify.routes.find((r: RouteReg) => r.method === method && r.path.includes(fragment));
  if (!found) throw new Error(`Route ${method} *${fragment}* introuvable`);
  return found;
}

function setup(state: LeftoverState, targetUserId: string) {
  const rows = state === 'none' ? [] : [leftoverRow(state, targetUserId)];
  // Sur les portes d'AJOUT, l'appelant doit lui-même être membre actif et admin.
  if (targetUserId !== ACTOR_ID) rows.push(leftoverRow('active', ACTOR_ID));
  const prisma = buildPrisma(rows);
  const fastify = createMockFastify(prisma);
  registerSharingRoutes(fastify as any, prisma, jest.fn<any>(), jest.fn<any>());
  registerParticipantsRoutes(fastify as any, prisma, jest.fn<any>(), jest.fn<any>());
  return { fastify, prisma, reply: createMockReply() };
}

// #4353 — `type: 'user'` est la forme RÉELLE que pose `createUnifiedAuthMiddleware`
// pour un inscrit (cf. `conversation-sharing.test.ts:makeRequest`) : la porte
// du lien la lit désormais pour dériver l'identité d'admission
// (`deriveLinkAdmissionIdentity`) — son absence faisait passer l'appelant pour
// un INVITÉ (`{kind:'guest'}`), qui crée un participant `anonymous` neuf au
// lieu de rejoindre sur la ligne de l'acteur.
const actorContext = {
  type: 'user', userId: ACTOR_ID, isAuthenticated: true, isAnonymous: false,
  registeredUser: { id: ACTOR_ID, role: 'USER' },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

// ─── Porte 1 — le lien de partage ─────────────────────────────────────────────

describe('POST /conversations/join/:linkId', () => {
  async function join(state: LeftoverState) {
    const ctx = setup(state, ACTOR_ID);
    const route = routeFor(ctx.fastify, 'POST', 'join/:linkId');
    // #4353 — cette porte lit désormais `request.headers`/`request.ip`
    // (`resolveClientIp`, pour `allowedIpRanges`) : un vrai `FastifyRequest`
    // les porte toujours, ce double factice doit donc les fournir aussi.
    await route.handler({ params: { linkId: 'lnk' }, body: {}, headers: {}, ip: '127.0.0.1', authContext: actorContext }, ctx.reply);
    return ctx;
  }

  // Sur cette porte, celui qui entre EST l'appelant : sa ligne est celle de l'acteur.
  const JOINER_ROW_ID = ACTOR_ROW_ID;

  it('réintègre l\'ancien membre sur SA ligne — quitter une conversation rejointe par lien n\'est plus définitif', async () => {
    const { prisma } = await join('departed');

    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: JOINER_ROW_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null }),
      })
    );
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('conserve `joinedAt` à la réintégration — il borne l\'historique d\'un lien sans `allowViewHistory`', async () => {
    const { prisma } = await join('departed');

    const data = prisma.participant.update.mock.calls[0][0].data;
    expect(data.joinedAt).toBeUndefined();
  });

  it('refuse un banni au lieu de lui répondre « vous êtes déjà membre »', async () => {
    // #4353 — cette porte délègue désormais à `admitLinkEntry`, qui rend son
    // verdict par `{status, code, message}` plutôt que par un helper nommé :
    // l'adaptateur mappe TOUT refus par `sendError(status, code, {message})`
    // (même convention que `POST /anonymous/join/:linkId` et `POST
    // /links/:key/members`), jamais par `sendForbidden` — un 403 spécifique
    // à un helper aurait exigé de réécrire le mapping code-par-code, soit la
    // recopie de police que #4167 ferme.
    const { prisma, reply } = await join('banned');

    expect(mockSendError).toHaveBeenCalledWith(reply, 403, 'BANNED', expect.objectContaining({ message: expect.any(String) }));
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('n\'écrit rien pour un membre déjà actif', async () => {
    const { prisma } = await join('active');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(mockSendSuccess).toHaveBeenCalled();
  });

  it('crée la ligne d\'un primo-arrivant, comme avant', async () => {
    const { prisma } = await join('none');

    expect(prisma.participant.create).toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('ne compte pas une réintégration comme un nouvel usage du lien deux fois', async () => {
    const { prisma } = await join('departed');

    // #4353 — l'incrément passe désormais par le `updateMany` ATOMIQUE de
    // #4167 (`claimLinkUse`), plus par un `update` simple.
    expect(prisma.conversationShareLink.updateMany).toHaveBeenCalledTimes(1);
  });
});

// ─── Porte 2 — l'ajout par un admin ───────────────────────────────────────────

describe('POST /conversations/:id/participants', () => {
  async function addMember(state: LeftoverState) {
    const ctx = setup(state, TARGET_ID);
    const route = routeFor(ctx.fastify, 'POST', ':id/participants');
    await route.handler(
      { params: { id: CONV_ID }, body: { userId: TARGET_ID }, authContext: actorContext },
      ctx.reply
    );
    return ctx;
  }

  it('refuse de faire entrer un BANNI — le bannissement ne se défait plus par la porte d\'à côté', async () => {
    const { prisma } = await addMember('banned');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('réactive la ligne d\'un ancien membre au lieu d\'en créer une SECONDE', async () => {
    const { prisma } = await addMember('departed');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_ROW_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null }),
      })
    );
  });

  it('refuse toujours un membre déjà actif', async () => {
    const { prisma } = await addMember('active');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(mockSendBadRequest).toHaveBeenCalled();
  });

  it('crée la ligne d\'un primo-arrivant, comme avant', async () => {
    const { prisma } = await addMember('none');

    expect(prisma.participant.create).toHaveBeenCalled();
  });
});

// ─── Porte 3 — l'invitation ───────────────────────────────────────────────────

describe('POST /conversations/:id/invite', () => {
  async function invite(state: LeftoverState) {
    const ctx = setup(state, TARGET_ID);
    const route = routeFor(ctx.fastify, 'POST', ':id/invite');
    await route.handler(
      { params: { id: CONV_ID }, body: { userId: TARGET_ID }, authContext: actorContext },
      ctx.reply
    );
    return ctx;
  }

  it('refuse d\'inviter un BANNI — troisième porte, même évasion', async () => {
    const { prisma } = await invite('banned');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(mockSendForbidden).toHaveBeenCalled();
  });

  it('réactive la ligne d\'un ancien membre au lieu d\'en créer une SECONDE', async () => {
    const { prisma } = await invite('departed');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: EXISTING_ROW_ID },
        data: expect.objectContaining({ isActive: true, leftAt: null }),
      })
    );
  });

  it('refuse toujours un membre déjà actif', async () => {
    const { prisma } = await invite('active');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(mockSendBadRequest).toHaveBeenCalled();
  });

  it('crée la ligne d\'un primo-arrivant, comme avant', async () => {
    const { prisma } = await invite('none');

    expect(prisma.participant.create).toHaveBeenCalled();
  });
});

// ─── Avis d'arrivée sur les trois portes des inscrits ────────────────────────
//
// Les mêmes trois portes que ci-dessus, sur une autre question : le fil dit-il
// que quelqu'un est entré ? Il ne le disait sur AUCUNE — les présents
// découvraient l'arrivant à son premier message.
//
// Le pendant du refus compte autant que l'annonce : une porte qui REFUSE ne
// doit rien annoncer. Un banni « annoncé » puis absent serait pire que le
// silence d'origine.

describe('Avis d’arrivée — les trois portes des inscrits', () => {
  // Sur la porte du LIEN, celui qui entre EST l'appelant : l'état résiduel se
  // pose sur sa ligne à lui. Sur les deux autres, il se pose sur la cible que
  // le membre fait entrer. Un `throughDoor` unique qui l'oublierait testerait
  // une conversation où personne n'arrive.
  async function throughDoor(pathFragment: string, state: LeftoverState) {
    const isLinkDoor = pathFragment === 'join/:linkId';
    const ctx = setup(state, isLinkDoor ? ACTOR_ID : TARGET_ID);
    const route = routeFor(ctx.fastify, 'POST', pathFragment);
    const params = isLinkDoor ? { linkId: 'lnk' } : { id: CONV_ID };
    // #4353 — la porte du lien lit `request.headers`/`request.ip` ; les deux
    // autres l'ignorent, donc les fournir ici ne leur coûte rien.
    await route.handler(
      { params, body: { userId: TARGET_ID }, headers: {}, ip: '127.0.0.1', authContext: actorContext },
      ctx.reply
    );
    return ctx;
  }

  const DOORS: readonly [string, string][] = [
    ['join/:linkId', 'la jointure par lien'],
    [':id/participants', 'l’ajout par un membre'],
    [':id/invite', 'l’invitation'],
  ];

  describe.each(DOORS)('%s — %s', (pathFragment) => {
    it('annonce l’arrivée d’un primo-arrivant', async () => {
      const { prisma } = await throughDoor(pathFragment, 'none');

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
      expect((prisma.message.create.mock.calls[0][0] as any).data).toMatchObject({
        conversationId: CONV_ID,
        messageType: 'system',
        metadata: expect.objectContaining({ kind: 'member-joined', isAnonymous: false }),
      });
    });

    it('annonce aussi un RETOUR — les présents ne l’ont pas vu partir non plus', async () => {
      const { prisma } = await throughDoor(pathFragment, 'departed');

      expect(prisma.message.create).toHaveBeenCalledTimes(1);
    });

    it('n’annonce RIEN pour un banni — la porte a refusé', async () => {
      const { prisma } = await throughDoor(pathFragment, 'banned');

      expect(prisma.message.create).not.toHaveBeenCalled();
    });

    it('n’annonce RIEN pour un membre déjà actif — personne n’est entré', async () => {
      const { prisma } = await throughDoor(pathFragment, 'active');

      expect(prisma.message.create).not.toHaveBeenCalled();
    });
  });
});
