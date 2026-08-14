/**
 * participants-membership-fanout.test.ts
 *
 * L'effectif d'une conversation est rendu sur l'écran de LISTE (iOS
 * `ThemedConversationRow`), pas seulement dans le fil. Or les trois routes qui
 * le font varier n'adressaient leurs événements qu'à `ROOMS.conversation(id)` —
 * la room que quitte précisément celui qui regarde sa liste. Deux conséquences,
 * de gravité inégale :
 *
 * 1. le départ / le retrait n'atteignaient pas les lignes de liste : compteur
 *    faux jusqu'à un rechargement complet, et `schedulePersist` écrivait la
 *    valeur périmée dans le cache disque ;
 * 2. l'ajout n'avait AUCUN événement exploitable. `conversation:joined` porte
 *    le même payload pour l'ack self-only d'un socket qui rejoint la room
 *    (`ConversationHandler`) — indiscernable d'une adhésion. Faute de pouvoir
 *    incrémenter sans compter chaque ouverture de fil, l'effectif ne pouvait
 *    que DÉRIVER VERS LE BAS. D'où `conversation:participant-joined`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: jest.fn<any>(),
}));

jest.mock('@meeshy/shared/utils/conversation-helpers', () => ({
  isValidMongoId: jest.fn<any>((id: string) => /^[0-9a-fA-F]{24}$/.test(id)),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  conversationParticipantSchema: { type: 'object' },
  errorResponseSchema: { type: 'object' },
}));

jest.mock('@meeshy/shared/types', () => ({
  UserRoleEnum: {},
}));

import { registerParticipantsRoutes } from '../../../routes/conversations/participants';

const CONV_ID = '507f1f77bcf86cd799439011';
const ACTOR_ID = '507f1f77bcf86cd799439022';
const TARGET_ID = '507f1f77bcf86cd799439033';
const WITNESS_ID = '507f1f77bcf86cd799439066';
/** Participant entré par lien de partage : aucune ligne `User` derrière lui. */
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd799439077';

type EmittedEvent = { rooms: string[]; event: string; payload: any };

/**
 * Double du `BroadcastOperator` de Socket.IO qui enregistre la CHAÎNE de rooms
 * ayant porté chaque emit. La propriété testée est « au plus une copie par
 * socket », que seul le chaînage garantit : un double à plat ne distinguerait
 * pas `io.to(a).to(b).emit()` de deux `emit` séparés.
 */
function createRecordingIO(emitted: EmittedEvent[]) {
  const chain = (rooms: string[]) => ({
    to(room: string) {
      return chain([...rooms, room]);
    },
    emit(event: string, payload: any) {
      emitted.push({ rooms, event, payload });
    },
  });
  return {
    to: (room: string) => chain([room]),
    in: jest.fn<any>().mockReturnValue({
      fetchSockets: jest.fn<any>().mockResolvedValue([{ leave: jest.fn() }]),
    }),
  };
}

function createMockNotificationService() {
  return {
    createAddedToConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberJoinedNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createRemovedFromConversationNotification: jest.fn<any>().mockResolvedValue(undefined),
    createMemberRemovedNotification: jest.fn<any>().mockResolvedValue(undefined),
  };
}

function createMockReply() {
  const reply: any = { status: jest.fn<any>(), send: jest.fn<any>() };
  reply.status.mockReturnValue(reply);
  return reply;
}

function createMockFastify() {
  const routes: { method: string; path: string; handler: (req: any, reply: any) => Promise<any> }[] = [];
  const push = (method: string) => jest.fn<any>((path: string, _options: any, handler: any) => {
    routes.push({ method, path, handler });
  });
  return {
    routes,
    get: push('GET'),
    post: push('POST'),
    delete: push('DELETE'),
    patch: push('PATCH'),
  };
}

/**
 * `participant.findMany` sert DEUX lectures dans ces routes : l'admission
 * (`resolveConversationEntry`, qui veut toutes les lignes de la paire
 * conversation/utilisateur, actives ou non) et l'éventail (les membres actifs
 * à qui adresser l'événement). Les discriminer par leur `where` — plutôt que
 * par un `mockResolvedValueOnce` positionnel — laisse le test survivre à une
 * requête ajoutée ailleurs dans la route.
 */
function createMockPrisma(audience: Array<{ id: string; userId: string | null }>) {
  const findMany = jest.fn<any>(async (args: any) => {
    const where = args?.where ?? {};
    if (where.isActive === true && where.userId === undefined) {
      return audience.filter((p) => !where.NOT || p.userId !== where.NOT.userId);
    }
    return [];
  });
  return {
    conversation: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: CONV_ID }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    participant: {
      findFirst: jest.fn<any>(),
      findMany,
      create: jest.fn<any>().mockResolvedValue({}),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      count: jest.fn<any>().mockResolvedValue(0),
    },
    user: {
      findFirst: jest.fn<any>().mockResolvedValue({
        id: TARGET_ID,
        username: 'target',
        displayName: 'Target User',
        firstName: null,
        lastName: null,
        avatar: null,
        systemLanguage: 'fr',
      }),
    },
  } as any;
}

function actorParticipant(role: string) {
  return { id: 'p-actor', conversationId: CONV_ID, userId: ACTOR_ID, role, isActive: true, user: { id: ACTOR_ID, role: 'USER' } };
}

describe('POST /conversations/:id/participants — l\'ajout devient comptable', () => {
  let prisma: any;
  let fastify: ReturnType<typeof createMockFastify>;
  let emitted: EmittedEvent[];

  beforeEach(() => {
    jest.clearAllMocks();
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID },
      { id: 'p-witness', userId: WITNESS_ID },
      { id: ANON_PARTICIPANT_ID, userId: null },
      { id: 'p-added', userId: TARGET_ID },
    ]);
    fastify = createMockFastify();
    registerParticipantsRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    (fastify as any).socketIOHandler = {
      getManager: () => ({
        getIO: () => createRecordingIO(emitted),
        joinUserToConversationRoom: jest.fn<any>().mockResolvedValue(undefined),
        invalidateParticipantCache: jest.fn(),
      }),
    };
    (fastify as any).notificationService = createMockNotificationService();
    prisma.participant.findFirst.mockResolvedValueOnce(actorParticipant('admin')).mockResolvedValue(null);
  });

  async function addTarget() {
    const route = fastify.routes.find((r) => r.method === 'POST')!;
    await route.handler(
      {
        params: { id: CONV_ID },
        body: { userId: TARGET_ID },
        authContext: { isAuthenticated: true, isAnonymous: false, userId: ACTOR_ID },
        server: {},
      },
      createMockReply()
    );
  }

  it('émet conversation:participant-joined vers les rooms PERSONNELLES des membres', async () => {
    await addTarget();

    const joined = emitted.filter((e) => e.event === 'conversation:participant-joined');
    expect(joined).toHaveLength(1);
    expect(joined[0].rooms).toEqual([
      `conversation:${CONV_ID}`,
      `user:${ACTOR_ID}`,
      `user:${WITNESS_ID}`,
      // Le participant sans compte est nommé par son `Participant.id` :
      // l'adresser par `userId` sauterait une room qui EXISTE.
      `user:${ANON_PARTICIPANT_ID}`,
    ]);
  });

  it('ÉCARTE le nouvel arrivant de l\'éventail', async () => {
    await addTarget();

    const joined = emitted.find((e) => e.event === 'conversation:participant-joined')!;
    // Il reçoit `CONVERSATION_NEW`, dont l'effectif vient du serveur et le
    // compte déjà : l'incrémenter en plus le mettrait en trop.
    expect(joined.rooms).not.toContain(`user:${TARGET_ID}`);
  });

  it('porte le même payload que son symétrique `participant-left`', async () => {
    await addTarget();

    const joined = emitted.find((e) => e.event === 'conversation:participant-joined')!;
    expect(joined.payload).toEqual({
      conversationId: CONV_ID,
      userId: TARGET_ID,
      displayName: 'Target User',
      joinedAt: expect.any(String),
      memberCount: expect.any(Number),
    });
  });

  // Le compteur ne devient convergent que si le payload porte un TOTAL : un
  // client qui incrémente ne se rattrape jamais d'un événement manqué (hors
  // room, hors ligne, trou de reconnexion), et les deux clients persistent la
  // dérive — cache disque iOS, `staleTime: Infinity` côté web.
  it('porte l\'effectif ABSOLU, arrivant COMPRIS', async () => {
    await addTarget();

    const joined = emitted.find((e) => e.event === 'conversation:participant-joined')!;
    // Quatre membres actifs. L'éventail en écarte l'arrivant — il n'en est pas
    // moins membre, et c'est l'effectif qui compte, pas l'audience.
    expect(joined.payload.memberCount).toBe(4);
  });

  it('laisse conversation:joined intact sur la seule room du fil', async () => {
    await addTarget();

    // Événement distinct, audience distincte : les consommateurs existants
    // (ParticipantsView, ConversationSyncEngine, web) ne bougent pas.
    const legacy = emitted.filter((e) => e.event === 'conversation:joined');
    expect(legacy).toHaveLength(1);
    expect(legacy[0].rooms).toEqual([`conversation:${CONV_ID}`]);
    expect(legacy[0].payload).toEqual({ conversationId: CONV_ID, userId: TARGET_ID });
  });
});

describe('DELETE /conversations/:id/participants/:userId — le retrait atteint les listes', () => {
  let prisma: any;
  let fastify: ReturnType<typeof createMockFastify>;
  let emitted: EmittedEvent[];

  beforeEach(() => {
    jest.clearAllMocks();
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID },
      { id: ANON_PARTICIPANT_ID, userId: null },
    ]);
    fastify = createMockFastify();
    registerParticipantsRoutes(fastify as any, prisma, jest.fn(), jest.fn());
    (fastify as any).socketIOHandler = {
      getManager: () => ({
        getIO: () => createRecordingIO(emitted),
        invalidateParticipantCache: jest.fn(),
      }),
    };
    (fastify as any).notificationService = createMockNotificationService();
    prisma.participant.findFirst
      .mockResolvedValueOnce(actorParticipant('creator'))
      .mockResolvedValue({ id: 'p-removed', displayName: 'Removed User' });
  });

  it('chaîne la room du fil et les rooms personnelles des membres restants', async () => {
    const route = fastify.routes.find((r) => r.method === 'DELETE')!;
    await route.handler(
      {
        params: { id: CONV_ID, userId: TARGET_ID },
        authContext: { isAuthenticated: true, isAnonymous: false, userId: ACTOR_ID },
        server: {},
      },
      createMockReply()
    );

    const left = emitted.filter((e) => e.event === 'conversation:participant-left');
    expect(left).toHaveLength(1);
    // La room du fil reste en TÊTE, et la room personnelle du RETIRÉ ferme la
    // chaîne. Cette dernière a longtemps manqué sur l'argument que « la room du
    // fil porte le retiré lui-même, encore dedans jusqu'à l'éviction qui suit
    // l'emit ». C'est vrai de l'appareil qui a le FIL ouvert, et faux de tous
    // les autres — or c'est l'argument même qui a fait ajouter les rooms
    // personnelles des membres restants (« l'écran de liste a quitté la room »).
    // Il n'avait été appliqué qu'à ceux dont le COMPTEUR bouge, jamais à celui
    // dont l'APPARTENANCE s'arrête.
    expect(left[0].rooms).toEqual([
      `conversation:${CONV_ID}`,
      `user:${ACTOR_ID}`,
      `user:${ANON_PARTICIPANT_ID}`,
      `user:${TARGET_ID}`,
    ]);
    expect(left[0].payload).toMatchObject({
      conversationId: CONV_ID,
      userId: TARGET_ID,
      displayName: 'Removed User',
    });
  });

  it("n'émet qu'UNE fois — un appareil du retiré resté dans la room ne double pas", async () => {
    const route = fastify.routes.find((r) => r.method === 'DELETE')!;
    await route.handler(
      {
        params: { id: CONV_ID, userId: TARGET_ID },
        authContext: { isAuthenticated: true, isAnonymous: false, userId: ACTOR_ID },
        server: {},
      },
      createMockReply()
    );

    // Le chaînage est ce qui le garantit : deux `emit` séparés livreraient deux
    // copies au socket assis dans les deux rooms, et un client qui RETIRE la
    // ligne sur cet événement la retirerait deux fois — anodin ici, mais la
    // même forme porte `memberCount` pour les restants.
    expect(emitted.filter((e) => e.event === 'conversation:participant-left')).toHaveLength(1);
  });
});
