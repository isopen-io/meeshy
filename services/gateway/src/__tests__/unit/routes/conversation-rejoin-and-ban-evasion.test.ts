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

jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  generateInitialLinkId: jest.fn<any>().mockReturnValue('initial-link-id'),
  generateFinalLinkId: jest.fn<any>().mockReturnValue('final-link-id'),
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
  const base = { id: userId === ACTOR_ID ? ACTOR_ROW_ID : EXISTING_ROW_ID, userId, conversationId: CONV_ID, role, joinedAt: new Date('2026-01-01') };
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

function buildPrisma(rows: any[], closed = false) {
  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async (args: any) => ({
        id: CONV_ID,
        isActive: !closed,
        closedAt: closed ? new Date('2026-06-01') : null,
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
        conversation: { id: CONV_ID, title: 'Test', type: 'group' },
      }),
      update: jest.fn<any>().mockResolvedValue({}),
      findMany: jest.fn<any>().mockResolvedValue([]),
      create: jest.fn<any>(),
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

function setup(state: LeftoverState, targetUserId: string, closed = false) {
  const rows = state === 'none' ? [] : [leftoverRow(state, targetUserId)];
  // Sur les portes d'AJOUT, l'appelant doit lui-même être membre actif et admin.
  if (targetUserId !== ACTOR_ID) rows.push(leftoverRow('active', ACTOR_ID));
  const prisma = buildPrisma(rows, closed);
  const fastify = createMockFastify(prisma);
  registerSharingRoutes(fastify as any, prisma, jest.fn<any>(), jest.fn<any>());
  registerParticipantsRoutes(fastify as any, prisma, jest.fn<any>(), jest.fn<any>());
  return { fastify, prisma, reply: createMockReply() };
}

const actorContext = {
  userId: ACTOR_ID, isAuthenticated: true, isAnonymous: false,
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
    await route.handler({ params: { linkId: 'lnk' }, body: {}, authContext: actorContext }, ctx.reply);
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
    const { prisma } = await join('banned');

    expect(mockSendForbidden).toHaveBeenCalled();
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

    expect(prisma.conversationShareLink.update).toHaveBeenCalledTimes(1);
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

// ─── Les trois portes face à une conversation CLOSE (cycle 70) ────────────────
//
// Le jumeau d'écriture refuse un message dans un fil clos depuis le cycle 31.
// Aucune des portes ne refusait d'y faire ENTRER : elles vérifiaient l'état de
// la LIGNE, et le lien de partage vérifiait l'état du LIEN — jamais celui du
// conteneur. Ce que recevait l'arrivant : une notification, un
// `conversation:new` que les clients PERSISTENT, et une conversation que
// `GET /conversations` ne sert pas et qui refuse chacun de ses messages.

describe('les portes d\'entrée face à une conversation close', () => {
  async function joinClosed(state: LeftoverState) {
    const ctx = setup(state, ACTOR_ID, true);
    const route = routeFor(ctx.fastify, 'POST', 'join/:linkId');
    await route.handler({ params: { linkId: 'lnk' }, body: {}, authContext: actorContext }, ctx.reply);
    return ctx;
  }

  async function addMemberClosed(state: LeftoverState) {
    const ctx = setup(state, TARGET_ID, true);
    const route = routeFor(ctx.fastify, 'POST', ':id/participants');
    await route.handler(
      { params: { id: CONV_ID }, body: { userId: TARGET_ID }, authContext: actorContext },
      ctx.reply
    );
    return ctx;
  }

  async function inviteClosed(state: LeftoverState) {
    const ctx = setup(state, TARGET_ID, true);
    const route = routeFor(ctx.fastify, 'POST', ':id/invite');
    await route.handler(
      { params: { id: CONV_ID }, body: { userId: TARGET_ID }, authContext: actorContext },
      ctx.reply
    );
    return ctx;
  }

  it('porte du lien — n\'admet PAS un primo-arrivant dans un fil terminal', async () => {
    const { prisma } = await joinClosed('none');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(mockSendSuccess).not.toHaveBeenCalled();
  });

  it('porte du lien — ne RÉINTÈGRE pas non plus : revenir dans un fil terminal n\'est pas revenir', async () => {
    const { prisma } = await joinClosed('departed');

    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('porte du lien — ne compte AUCUN usage du lien pour une entrée refusée', async () => {
    const { prisma } = await joinClosed('none');

    expect(prisma.conversationShareLink.update).not.toHaveBeenCalled();
  });

  it('porte de l\'admin — n\'admet PAS, et ne notifie personne d\'une adhésion qui n\'a pas eu lieu', async () => {
    const { prisma, fastify } = await addMemberClosed('none');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(fastify.notificationService.createAddedToConversationNotification).not.toHaveBeenCalled();
  });

  it('porte de l\'admin — n\'annonce RIEN sur le fil : pas de `conversation:new` à écrire dans un cache persistant', async () => {
    const { fastify } = await addMemberClosed('none');

    const io = fastify.socketIOHandler.getManager().getIO();
    expect(io.to).not.toHaveBeenCalled();
  });

  it('porte de l\'admin — refuse aussi la réintégration', async () => {
    const { prisma } = await addMemberClosed('departed');

    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('porte de l\'invitation — n\'admet PAS dans un fil terminal', async () => {
    const { prisma } = await inviteClosed('none');

    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('porte de l\'invitation — refuse aussi la réintégration', async () => {
    const { prisma } = await inviteClosed('departed');

    expect(prisma.participant.update).not.toHaveBeenCalled();
    expect(prisma.participant.create).not.toHaveBeenCalled();
  });

  it('n\'oppose pas la clôture à un membre déjà actif — aucune écriture n\'était en jeu, sa réponse ne change pas', async () => {
    const { prisma } = await joinClosed('active');

    expect(mockSendSuccess).toHaveBeenCalled();
    expect(prisma.participant.create).not.toHaveBeenCalled();
    expect(prisma.participant.update).not.toHaveBeenCalled();
  });

  it('n\'oppose pas la clôture à un banni — le refus de sécurité garde ses mots', async () => {
    await joinClosed('banned');

    expect(mockSendForbidden).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining('banni')
    );
  });
});
