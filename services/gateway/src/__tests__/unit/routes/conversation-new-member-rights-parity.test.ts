/**
 * #4174 — **un nouveau membre reçoit les mêmes droits, quelle que soit la
 * porte qui l'ajoute.**
 *
 * Deux portes ajoutent un membre nommé à une conversation :
 *
 *   - `POST /conversations/:id/invite`       (`routes/conversations/sharing.ts`)
 *   - `POST /conversations/:id/participants` (`routes/conversations/participants-writes.ts`)
 *
 * Elles partagent le résolveur d'admission (`resolveConversationEntry`),
 * produisent la même ligne de rôle `member`, et sont déclenchées par le même
 * écran. Elles écrivaient pourtant DEUX tables de permissions : `invite`
 * posait `canSendVideos: false, canSendAudios: false`, `participants` posait
 * les deux à `true`. Le même utilisateur, ajouté au même groupe, recevait
 * donc des droits différents selon le bouton employé.
 *
 * ## Pourquoi ce fichier compare, au lieu d'assertir une valeur
 *
 * C'est la subtilité que l'issue nomme au critère 4, et elle est décisive :
 * **un témoin posé sur UNE SEULE porte ne peut pas rougir si les deux
 * divergent à nouveau.** Chacune resterait verte sur sa propre table. La
 * divergence n'existe que dans la comparaison — c'est donc la comparaison
 * qu'il faut écrire, sur le même utilisateur et la même conversation.
 *
 * Le second `it` assertit en plus la valeur RETENUE, champ par champ : sans
 * lui, les deux portes pourraient converger vers n'importe quoi (y compris
 * vers tout à `false`) sans qu'aucun témoin ne tombe. Les deux témoins sont
 * nécessaires, et ni l'un ni l'autre ne suffit.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const mockResolveConversationId = jest.fn<any>();

const noop = jest.fn<any>((reply: any) => reply);

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../routes/conversations/utils/identifier-generator', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/identifier-generator') as object),
  generateUniqueShareLinkId: jest.fn<any>().mockResolvedValue('mshy_TestLnk1'),
  ensureUniqueShareLinkIdentifier: jest.fn<any>().mockResolvedValue('mshy_unique'),
}));

const mockSendForbidden = jest.fn<any>((reply: any) => reply);

jest.mock('../../../utils/response', () => ({
  sendSuccess: jest.fn<any>((reply: any) => reply),
  sendBadRequest: jest.fn<any>((reply: any) => reply),
  sendUnauthorized: jest.fn<any>((reply: any) => reply),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: jest.fn<any>((reply: any) => reply),
  sendConflict: jest.fn<any>((reply: any) => reply),
  sendInternalError: jest.fn<any>((reply: any) => reply),
  sendError: jest.fn<any>((reply: any) => reply),
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

import { registerSharingRoutes } from '../../../routes/conversations/sharing';
import { registerParticipantsRoutes } from '../../../routes/conversations/participants';
import { NEW_MEMBER_PERMISSIONS } from '../../../services/participantRights';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const TARGET_ID = '507f1f77bcf86cd799439033';
const ACTOR_ROW_ID = '507f1f77bcf86cd799439077';

/** Le rang de l'appelant est un PARAMÈTRE : c'est lui que la parité de rang interroge. */
function ligneAppelant(role: string) {
  return {
    id: ACTOR_ROW_ID, userId: ACTOR_ID, conversationId: CONV_ID, role,
    isActive: true, bannedAt: null, joinedAt: new Date('2026-01-01'),
    permissions: { canSendMessages: true, canSendFiles: true, canSendImages: true, canViewHistory: true },
  };
}

const actorRow = ligneAppelant('admin');

const targetUser = {
  id: TARGET_ID, username: 'target', displayName: 'Target', avatar: null, systemLanguage: 'fr',
  firstName: 'T', lastName: 'Arget',
};

function rowsMatching(rows: any[], where: any) {
  return rows.filter((row) => {
    if (where?.userId !== undefined && where.userId !== row.userId) return false;
    if (where?.conversationId !== undefined && where.conversationId !== row.conversationId) return false;
    if (where?.isActive !== undefined && where.isActive !== row.isActive) return false;
    if (where?.role?.in !== undefined && !where.role.in.includes(row.role)) return false;
    return true;
  });
}

function buildPrisma(actorRole: string = 'admin') {
  const actorRow = ligneAppelant(actorRole);
  return {
    conversation: {
      findUnique: jest.fn<any>(async (args: any) => ({
        id: CONV_ID, type: 'group', title: 'Test', isActive: true, closedAt: null,
        createdAt: new Date('2025-01-01'),
        participants: rowsMatching([actorRow], args?.include?.participants?.where).map((row) => ({
          id: row.id, userId: row.userId, role: row.role,
          user: { id: row.userId, username: 'u', role: 'USER' },
        })),
      })),
      update: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
    },
    participant: {
      findFirst: jest.fn<any>(async (args: any) => rowsMatching([actorRow], args?.where)[0] ?? null),
      findUnique: jest.fn<any>(async (args: any) => (args?.where?.id === ACTOR_ROW_ID ? actorRow : null)),
      findMany: jest.fn<any>(async (args: any) => rowsMatching([actorRow], args?.where)),
      create: jest.fn<any>(async (args: any) => ({ id: 'created-row', ...args?.data, user: targetUser })),
      update: jest.fn<any>(async (args: any) => ({ id: args?.where?.id, ...args?.data, user: targetUser })),
      count: jest.fn<any>().mockResolvedValue(2),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue(targetUser),
      findFirst: jest.fn<any>().mockResolvedValue(targetUser),
    },
    message: { create: jest.fn<any>(async (args: any) => ({ id: 'sys-row', ...args?.data })) },
  } as any;
}

function createMockFastify(prisma: any) {
  const routes: { method: string; path: string; handler: any }[] = [];
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
        broadcastMessage: jest.fn<any>().mockResolvedValue(undefined),
      }),
    },
    get: register('GET'), post: register('POST'), patch: register('PATCH'), delete: register('DELETE'),
  } as any;
}

function createMockReply() {
  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>((b: any) => { reply._body = b; return reply; }) };
  reply.status.mockReturnValue(reply);
  return reply;
}

function routeFor(fastify: any, method: string, fragment: string) {
  const found = fastify.routes.find((r: any) => r.method === method && r.path.includes(fragment));
  if (!found) throw new Error(`Route ${method} *${fragment}* introuvable`);
  return found;
}

const actorContext = {
  type: 'user', userId: ACTOR_ID, isAuthenticated: true, isAnonymous: false,
  registeredUser: { id: ACTOR_ID, role: 'USER' },
};

/**
 * Tente l'admission du MÊME utilisateur dans la MÊME conversation, par la
 * porte et avec le rang demandés — et rend l'OBSERVABLE qui décide : la ligne
 * a-t-elle été écrite ?
 *
 * C'est le `create` qu'on regarde, jamais la réponse : les deux portes
 * refusent avant d'écrire, et une réponse mockée ne distingue pas un refus
 * d'un succès.
 */
async function tenterAdmission(porte: 'invite' | 'participants', actorRole: string) {
  const prisma = buildPrisma(actorRole);
  const fastify = createMockFastify(prisma);
  registerSharingRoutes(fastify, prisma, noop, noop);
  registerParticipantsRoutes(fastify, prisma, noop, noop);

  const route = porte === 'invite'
    ? routeFor(fastify, 'POST', ':id/invite')
    : routeFor(fastify, 'POST', ':id/participants');

  await route.handler(
    { params: { id: CONV_ID }, body: { userId: TARGET_ID }, headers: {}, ip: '127.0.0.1',
      authContext: actorContext, user: { userId: ACTOR_ID } },
    createMockReply()
  );

  return { prisma, ecrit: prisma.participant.create.mock.calls.length > 0 };
}

/** Fait entrer le MÊME utilisateur dans la MÊME conversation, par la porte demandée. */
async function admitThrough(porte: 'invite' | 'participants') {
  const { prisma, ecrit } = await tenterAdmission(porte, 'admin');

  expect(ecrit).toBe(true);
  return prisma.participant.create.mock.calls[0][0].data.permissions;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockResolveConversationId.mockResolvedValue(CONV_ID);
});

describe('#4174 — les deux portes d\'ajout écrivent la MÊME table de droits', () => {
  it('invite et participants posent des permissions identiques, champ par champ', async () => {
    const parInvite = await admitThrough('invite');
    const parParticipants = await admitThrough('participants');

    // `toEqual` et non `toMatchObject` : une porte qui poserait un droit EN
    // PLUS serait une divergence, pas un supplément.
    expect(parInvite).toEqual(parParticipants);
  });

  it('et cette table est celle du site unique — sans quoi les deux pourraient converger vers n\'importe quoi', async () => {
    const parInvite = await admitThrough('invite');

    expect(parInvite).toEqual({ ...NEW_MEMBER_PERMISSIONS });
  });

  it('la table retenue ouvre vidéo et audio — la variante restrictive ne restreignait rien, `canSendFiles` restant ouvert', async () => {
    const parInvite = await admitThrough('invite');

    expect(parInvite.canSendVideos).toBe(true);
    expect(parInvite.canSendAudios).toBe(true);
    expect(parInvite.canSendFiles).toBe(true);
  });

  it('et elle garde fermés position, liens et historique — le lot n\'ouvre pas ce que les deux portes fermaient déjà', async () => {
    const parParticipants = await admitThrough('participants');

    expect(parParticipants.canSendLocations).toBe(false);
    expect(parParticipants.canSendLinks).toBe(false);
    expect(parParticipants.canViewHistory).toBe(false);
  });
});

describe('#4174 — le site unique ne peut pas être muté par un appelant', () => {
  it('NEW_MEMBER_PERMISSIONS est gelé — les deux portes l\'étalent dans un `data` Prisma', () => {
    expect(Object.isFrozen(NEW_MEMBER_PERMISSIONS)).toBe(true);
  });
});

/**
 * #4557 — **les deux portes exigent le MÊME rang.**
 *
 * `POST …/invite` exigeait ADMIN, `POST …/participants` exige MODERATOR — pour
 * un geste dont ce fichier vient d'établir, table de droits à l'appui, qu'il
 * produit la MÊME ligne. La divergence était donc une incohérence pure
 * (dimension 6), jamais une protection : un modérateur à qui `invite` refusait
 * quelqu'un l'ajoutait par l'autre porte, dans la seconde, avec les mêmes
 * droits et un éventail de diffusion PLUS complet.
 *
 * **Aucune des deux portes ne crée d'invitation EN ATTENTE** — la question
 * qu'il fallait poser avant d'unifier, et à laquelle la lecture ligne à ligne
 * répond : les deux écrivent une ligne `Participant` immédiatement ACTIVE,
 * `role: 'member'`, `permissions: NEW_MEMBER_PERMISSIONS`, par le même
 * `resolveConversationEntry`. « Inviter » nomme ici un ajout direct. Un rang
 * plus haut sur l'une des deux ne retenait rien.
 *
 * **L'unification se fait vers le BAS, et c'est le seul sens non régressif.**
 * Monter `participants` à ADMIN retirerait aux modérateurs une capacité VIVANTE
 * — les trois clients passent par cette porte — pour fermer une porte que
 * personne n'appelle. Descendre `invite` à MODERATOR ne crée aucun pouvoir :
 * il n'ouvre pas un chemin, il cesse d'en fermer un que l'autre laissait
 * ouvert. Le plancher LUI-MÊME (un modérateur peut-il ajouter ?) reste ce
 * qu'il était : le changer serait une décision produit, pas une mise en
 * cohérence.
 *
 * Comme pour les droits ci-dessus, **le témoin COMPARE** : posé sur une seule
 * porte, il ne pourrait pas rougir si les deux redivergeaient.
 */
describe('#4557 — les deux portes d\'ajout exigent le MÊME rang', () => {
  it('un modérateur passe par les DEUX portes, ou par aucune — jamais par une seule', async () => {
    const parInvite = await tenterAdmission('invite', 'moderator');
    const parParticipants = await tenterAdmission('participants', 'moderator');

    expect(parInvite.ecrit).toBe(parParticipants.ecrit);
  });

  it('et le rang retenu est MODERATOR — les deux portes admettent', async () => {
    // Sans ce second témoin, les deux portes pourraient converger vers ADMIN
    // (donc retirer une capacité vivante aux modérateurs) sans que le premier
    // ne tombe : il n'assertit qu'une ÉGALITÉ.
    expect((await tenterAdmission('invite', 'moderator')).ecrit).toBe(true);
    expect((await tenterAdmission('participants', 'moderator')).ecrit).toBe(true);
  });

  it('un membre simple reste refusé par les deux — le plancher descend, il ne disparaît pas', async () => {
    const parInvite = await tenterAdmission('invite', 'member');
    const parParticipants = await tenterAdmission('participants', 'member');

    expect(parInvite.ecrit).toBe(false);
    expect(parParticipants.ecrit).toBe(false);
    expect(mockSendForbidden).toHaveBeenCalled();
  });
});
