/**
 * #4557 — **ajouter N personnes part en UN appel, avec un verdict par
 * personne.**
 *
 * Le web invitait N personnes par N appels (`invite-user-modal.tsx`, un
 * `Promise.all` d'un `POST …/invite` par personne). Chacun repayait la
 * résolution de conversation, la vérification de rang de l'appelant, l'avis
 * d'arrivée et l'éventail de diffusion. Et — le défaut d'usage, pas seulement
 * de coût — **`Promise.all` rejette au premier échec** : un lot dont une seule
 * personne était déjà membre ressemblait, côté écran, à une panne.
 *
 * Ce que ces témoins gardent tient en une phrase : **un refus par personne ne
 * fait pas échouer le lot, et un refus qui porte sur la CONVERSATION ou sur
 * l'APPELANT n'est pas un verdict par personne.** Diluer un 403 de rang en
 * cinquante verdicts identiques ferait passer pour un résultat partiel ce qui
 * n'a rien produit.
 *
 * Les doubles Prisma DISCRIMINENT sur le `where` — un double qui rend la même
 * ligne quel que soit le filtre laisserait passer le cas « déjà membre », qui
 * est précisément celui que le lot doit savoir dire.
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

// ─── Imports après les mocks ──────────────────────────────────────────────────

import { registerParticipantsRoutes } from '../../../routes/conversations/participants';
import {
  normalizeParticipantBatch,
  MAX_PARTICIPANTS_PER_CALL,
} from '../../../routes/conversations/participants-writes';

// ─── IDs ──────────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const NOUVEAU_A = '507f1f77bcf86cd799439033';
const NOUVEAU_B = '507f1f77bcf86cd799439044';
const DEJA_MEMBRE = '507f1f77bcf86cd799439055';

// ─── Doubles ──────────────────────────────────────────────────────────────────

function ligne(userId: string, role: string) {
  return {
    id: `row-${userId}`, userId, conversationId: CONV_ID, role, isActive: true, bannedAt: null,
    joinedAt: new Date('2026-01-01'),
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
  };
}

function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.userId !== undefined) {
      if (typeof where.userId === 'string' && where.userId !== row.userId) return false;
      if (where.userId?.notIn && where.userId.notIn.includes(row.userId)) return false;
    }
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.NOT?.userId !== undefined && where.NOT.userId === row.userId) return false;
    if (where?.type !== undefined && where.type !== 'user') return false;
    return true;
  });
}

/** `role` de l'appelant : ce qui décide du 403 de plancher. */
function buildContext(actorRole: string, existants: string[] = [DEJA_MEMBRE]) {
  const rows = [ligne(ACTOR_ID, actorRole), ...existants.map((id) => ligne(id, 'member'))];
  const utilisateursConnus = new Set([NOUVEAU_A, NOUVEAU_B, DEJA_MEMBRE, ACTOR_ID]);

  const prisma: any = {
    conversation: {
      findUnique: jest.fn<any>(async () => ({
        id: CONV_ID, type: 'group', title: 'Test', createdAt: new Date('2025-01-01'),
        isActive: true, closedAt: null,
      })),
    },
    participant: {
      findFirst: jest.fn<any>(async (args: any) => rowsMatching(rows, args?.where)[0] ?? null),
      findUnique: jest.fn<any>(async (args: any) => rows.find((r) => r.id === args?.where?.id) ?? null),
      findMany: jest.fn<any>(async (args: any) => rowsMatching(rows, args?.where)),
      create: jest.fn<any>(async (args: any) => {
        const cree = { id: `created-${args?.data?.userId}`, ...args?.data, isActive: true, bannedAt: null };
        rows.push(cree);
        return cree;
      }),
      update: jest.fn<any>(async (args: any) => ({ id: args?.where?.id, ...args?.data })),
    },
    user: {
      findFirst: jest.fn<any>(async (args: any) => (
        utilisateursConnus.has(args?.where?.id)
          ? { id: args.where.id, username: 'u', displayName: 'U', avatar: null, systemLanguage: 'fr' }
          : null
      )),
      findUnique: jest.fn<any>(async (args: any) => (
        utilisateursConnus.has(args?.where?.id)
          ? { id: args.where.id, username: 'u', displayName: 'U', avatar: null, systemLanguage: 'fr' }
          : null
      )),
    },
    message: { create: jest.fn<any>(async (args: any) => ({ id: 'sys-row', ...args?.data })) },
  };

  const routes: any[] = [];
  const register = (method: string) =>
    jest.fn<any>((path: string, options: any, handler: any) => {
      routes.push({ method, path, handler: handler ?? options.handler ?? options });
    });
  // Le double d'`io` doit être CHAÎNABLE : `emitToConversationParticipants`
  // enchaîne `io.to(room).to(room)…​.except(room)` avant d'émettre. Un `to` qui
  // rend `{ emit }` casse au deuxième maillon — et l'exception, avalée par le
  // `catch` du handler, se lisait « Erreur lors de l'ajout du participant »,
  // c'est-à-dire comme un défaut de la route.
  const emit = jest.fn<any>();
  const chainable: any = { emit };
  chainable.to = jest.fn<any>(() => chainable);
  chainable.except = jest.fn<any>(() => chainable);
  const fastify: any = {
    routes, prisma,
    notificationService: {
      createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
      createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    },
    socketIOHandler: {
      getManager: jest.fn<any>().mockReturnValue({
        getIO: jest.fn<any>().mockReturnValue(chainable),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
        broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
    get: register('GET'), post: register('POST'), patch: register('PATCH'), delete: register('DELETE'),
  };
  registerParticipantsRoutes(fastify, prisma, jest.fn<any>(), jest.fn<any>());

  const reply: any = { _body: undefined, status: jest.fn<any>(), send: jest.fn<any>() };
  reply.status.mockReturnValue(reply);

  const route = routes.find((r) => r.method === 'POST' && r.path === '/conversations/:id/participants');
  if (!route) throw new Error('Route POST /conversations/:id/participants introuvable');

  return { prisma, fastify, reply, emit, rows, route };
}

async function ajouter(ctx: ReturnType<typeof buildContext>, body: any) {
  await ctx.route.handler(
    {
      params: { id: CONV_ID },
      body,
      authContext: { type: 'user', userId: ACTOR_ID, isAuthenticated: true, registeredUser: { id: ACTOR_ID, role: 'USER' } },
    },
    ctx.reply
  );
  return ctx.reply._body;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

// ─── Le contrat de lot, sans Fastify ─────────────────────────────────────────

describe('normalizeParticipantBatch — la lecture du corps', () => {
  it('accepte les DEUX formes et rend la même liste — en disant LAQUELLE', () => {
    // `single` n'est pas une commodité : c'est lui qui décide si un refus se
    // dit en 400/403 (contrat historique des clients déployés) ou en verdict.
    expect(normalizeParticipantBatch({ userId: 'a' })).toEqual({ userIds: ['a'], single: true });
    expect(normalizeParticipantBatch({ userIds: ['a'] })).toEqual({ userIds: ['a'], single: false });
  });

  it('dédoublonne — deux fois le même identifiant ferait DEUX avis d’arrivée', () => {
    expect(normalizeParticipantBatch({ userIds: ['a', 'b', 'a'] }).userIds).toEqual(['a', 'b']);
  });

  it('refuse un lot vide', () => {
    expect(normalizeParticipantBatch({}).error).toBeTruthy();
    expect(normalizeParticipantBatch({ userIds: [] }).error).toBeTruthy();
    expect(normalizeParticipantBatch({ userIds: ['   '] }).error).toBeTruthy();
  });

  it(`refuse au-delà de ${MAX_PARTICIPANTS_PER_CALL}`, () => {
    const trop = Array.from({ length: MAX_PARTICIPANTS_PER_CALL + 1 }, (_, i) => `u${i}`);
    expect(normalizeParticipantBatch({ userIds: trop }).error).toContain(String(MAX_PARTICIPANTS_PER_CALL));
    const pile = trop.slice(0, MAX_PARTICIPANTS_PER_CALL);
    expect(normalizeParticipantBatch({ userIds: pile }).userIds).toHaveLength(MAX_PARTICIPANTS_PER_CALL);
  });

  it('le plafond se mesure sur la liste DÉDOUBLONNÉE', () => {
    // Cinquante et une entrées dont deux identiques valent cinquante personnes :
    // les refuser punirait une saisie que le serveur ramène de toute façon au
    // plafond.
    const cinquanteEtUne = [
      ...Array.from({ length: MAX_PARTICIPANTS_PER_CALL, }, (_, i) => `u${i}`),
      'u0',
    ];
    expect(normalizeParticipantBatch({ userIds: cinquanteEtUne }).error).toBeUndefined();
  });
});

// ─── Le lot, bout en bout ────────────────────────────────────────────────────

describe('POST /conversations/:id/participants — un verdict par identifiant', () => {
  it('un lot de 3 dont 1 déjà membre rend 3 verdicts, écrit 2 lignes, et n’échoue PAS', async () => {
    const ctx = buildContext('admin');

    const body = await ajouter(ctx, { userIds: [NOUVEAU_A, DEJA_MEMBRE, NOUVEAU_B] });

    expect(body.success).toBe(true);
    expect(body.data.results).toEqual([
      { userId: NOUVEAU_A, outcome: 'new', participantId: `created-${NOUVEAU_A}` },
      { userId: DEJA_MEMBRE, outcome: 'already-member' },
      { userId: NOUVEAU_B, outcome: 'new', participantId: `created-${NOUVEAU_B}` },
    ]);
    expect(ctx.prisma.participant.create).toHaveBeenCalledTimes(2);
  });

  it('un identifiant INCONNU est un verdict, pas un 404 pour tout le monde', async () => {
    const ctx = buildContext('admin');

    const body = await ajouter(ctx, { userIds: [NOUVEAU_A, 'inexistant'] });

    expect(body.success).toBe(true);
    expect(body.data.results.map((r: any) => r.outcome)).toEqual(['new', 'not-found']);
    expect(ctx.prisma.participant.create).toHaveBeenCalledTimes(1);
  });

  it('la forme historique `userId` réussit comme avant, et gagne le verdict EN PLUS', async () => {
    const ctx = buildContext('admin');

    const body = await ajouter(ctx, { userId: NOUVEAU_A });

    expect(body.data.message).toBe('Participant ajouté avec succès');
    expect(body.data.results).toEqual([
      { userId: NOUVEAU_A, outcome: 'new', participantId: `created-${NOUVEAU_A}` },
    ]);
  });

  // Les trois clients DÉPLOYÉS appellent avec `userId` et lisent le 400/403
  // pour dire « déjà membre ». Leur rendre un 200 dont le refus vit dans un
  // champ qu'ils ne lisent pas transformerait un refus en succès à l'écran,
  // sur toutes les versions installées. Le verdict par personne est un contrat
  // NEUF, réservé à la forme neuve.
  it('la forme historique garde son contrat d’ERREUR — un refus reste un refus', async () => {
    const ctx = buildContext('admin');

    const body = await ajouter(ctx, { userId: DEJA_MEMBRE });

    expect(body.success).toBe(false);
    expect(mockSendBadRequest).toHaveBeenCalled();
    expect(ctx.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('la MÊME situation, en LOT, rend un verdict et non une erreur', async () => {
    const ctx = buildContext('admin');

    const body = await ajouter(ctx, { userIds: [DEJA_MEMBRE] });

    expect(body.success).toBe(true);
    expect(body.data.results).toEqual([{ userId: DEJA_MEMBRE, outcome: 'already-member' }]);
  });

  it(`refuse un lot de ${MAX_PARTICIPANTS_PER_CALL + 1} — et n’écrit RIEN`, async () => {
    const ctx = buildContext('admin');
    const trop = Array.from({ length: MAX_PARTICIPANTS_PER_CALL + 1 }, (_, i) => `u${i}`);

    const body = await ajouter(ctx, { userIds: trop });

    expect(body.success).toBe(false);
    expect(ctx.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('un membre simple est refusé sur TOUT le lot — un 403 n’est pas un verdict par personne', async () => {
    const ctx = buildContext('member');

    const body = await ajouter(ctx, { userIds: [NOUVEAU_A, NOUVEAU_B] });

    expect(body.success).toBe(false);
    expect(mockSendForbidden).toHaveBeenCalled();
    expect(body.data).toBeUndefined();
    expect(ctx.prisma.participant.create).not.toHaveBeenCalled();
  });

  it('un modérateur passe — le plancher de cette porte est MODERATOR', async () => {
    const ctx = buildContext('moderator');

    const body = await ajouter(ctx, { userIds: [NOUVEAU_A] });

    expect(body.success).toBe(true);
    expect(body.data.results[0].outcome).toBe('new');
  });

  it('chaque admission émet son PROPRE avis d’arrivée — l’éventail n’est pas mécanique', async () => {
    const ctx = buildContext('admin');

    await ajouter(ctx, { userIds: [NOUVEAU_A, NOUVEAU_B] });

    // Deux messages système, un par arrivant : un lot qui n'en poserait qu'un
    // laisserait la seconde entrée invisible dans le fil.
    expect(ctx.prisma.message.create).toHaveBeenCalledTimes(2);
    expect(ctx.fastify.notificationService.createAddedToConversationNotification)
      .toHaveBeenCalledTimes(2);
  });
});
