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

type EmittedEvent = { rooms: string[]; excepts: string[]; event: string; payload: any };

/**
 * Double du `BroadcastOperator` de Socket.IO qui enregistre la CHAÎNE de rooms
 * ayant porté chaque emit. La propriété testée est « au plus une copie par
 * socket », que seul le chaînage garantit : un double à plat ne distinguerait
 * pas `io.to(a).to(b).emit()` de deux `emit` séparés.
 */
function createRecordingIO(emitted: EmittedEvent[]) {
  const chain = (rooms: string[], excepts: string[]): any => ({
    to(room: string) {
      return chain([...rooms, room], excepts);
    },
    // `except` est RETENU, pas avalé : c'est lui qui garantit qu'un lecteur
    // autorisé assis dans la room du fil ne reçoive pas AUSSI la copie
    // plafonnée destinée aux autres.
    except(room: string) {
      return chain(rooms, [...excepts, room]);
    },
    emit(event: string, payload: any) {
      emitted.push({ rooms, excepts, event, payload });
    },
  });
  return {
    to: (room: string) => chain([room], []),
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

/**
 * La CIBLE du retrait. Ces suites rendaient `null` à la seconde question, ce que
 * le handler tolérait : il diffusait quand même. Il répond désormais 404 — une
 * expulsion qui ne trouve pas sa cible ne doit pas prétendre avoir eu lieu — et
 * le fanout n'existe donc que sur une cible RÉELLE.
 */
function targetParticipant(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p-target',
    conversationId: CONV_ID,
    userId: TARGET_ID,
    role: 'member',
    isActive: true,
    leftAt: null,
    bannedAt: null,
    displayName: 'Target User',
    shareLinkId: null,
    ...overrides,
  };
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
    prisma.participant.findFirst.mockResolvedValueOnce(actorParticipant('admin')).mockResolvedValue(targetParticipant());
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

  // Le fanout est un broadcast unique vers toute la room : l'effectif y est
  // plafonné à 199 pour tout le monde (un admin plateforme récupère l'exact au
  // prochain fetch REST — c'est le compromis du canal partagé).
  it('plafonne l\'effectif du fanout à 199 avec drapeau au-delà de 199 membres', async () => {
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID },
      ...Array.from({ length: 249 }, (_, i) => ({ id: `p-big-${i}`, userId: null })),
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
    prisma.participant.findFirst.mockResolvedValueOnce(actorParticipant('admin')).mockResolvedValue(targetParticipant());

    await addTarget();

    const joined = emitted.find((e) => e.event === 'conversation:participant-joined')!;
    expect(joined.payload.memberCount).toBe(199);
    expect(joined.payload.memberCountCapped).toBe(true);
  });

  // Lot 1 — l'effectif ENTIER sur le canal socket. Le fanout est un broadcast,
  // et il ne portait qu'UNE présentation : la plafonnée. Un admin de groupe qui
  // venait de lire 250 par REST voyait son compteur retomber à « 199+ » au
  // premier ajout — le canal partagé DÉGRADAIT ce que la règle produit accorde,
  // et les deux clients persistent cette valeur.
  it('sert l\'effectif ENTIER à l\'admin du GROUPE, plafonné aux autres', async () => {
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID, role: 'admin', user: { role: 'USER' } },
      ...Array.from({ length: 249 }, (_, i) => ({
        id: `p-big-${i}`,
        userId: null,
        role: 'member',
        user: null,
      })),
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
    prisma.participant.findFirst.mockResolvedValueOnce(actorParticipant('admin')).mockResolvedValue(targetParticipant());

    await addTarget();

    const joined = emitted.filter((e) => e.event === 'conversation:participant-joined');
    expect(joined).toHaveLength(2);

    const capped = joined[0];
    expect(capped.payload.memberCount).toBe(199);
    expect(capped.payload.memberCountCapped).toBe(true);
    expect(capped.rooms).toContain(`conversation:${CONV_ID}`);
    expect(capped.rooms).not.toContain(`user:${ACTOR_ID}`);
    expect(capped.excepts).toEqual([`user:${ACTOR_ID}`]);

    const exact = joined[1];
    expect(exact.rooms).toEqual([`user:${ACTOR_ID}`]);
    // 250 dans l'éventail + l'arrivant, que l'éventail écarte : 251.
    expect(exact.payload.memberCount).toBe(251);
    expect(exact.payload.memberCountCapped).toBeUndefined();
  });

  it('demande le rôle de conversation ET le rôle plateforme de l\'éventail', async () => {
    await addTarget();

    const audienceCall = prisma.participant.findMany.mock.calls.find(
      (call: any[]) => call[0]?.where?.isActive === true && call[0]?.where?.NOT
    );
    expect(audienceCall?.[0]?.select).toMatchObject({
      id: true,
      userId: true,
      role: true,
      user: { select: { role: true } },
    });
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
      // La cible porte le `select` de production : `isActive` (le handler refuse
      // de retirer quelqu'un déjà sorti), `userId` (room personnelle + payload)
      // et `shareLinkId`.
      .mockResolvedValue(targetParticipant({ id: 'p-removed', displayName: 'Removed User' }));
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

  it('plafonne l\'effectif des restants à 199 avec drapeau au-delà', async () => {
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID },
      ...Array.from({ length: 249 }, (_, i) => ({ id: `p-big-${i}`, userId: null })),
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
      .mockResolvedValue(targetParticipant({ id: 'p-removed', displayName: 'Removed User' }));

    const route = fastify.routes.find((r) => r.method === 'DELETE')!;
    await route.handler(
      {
        params: { id: CONV_ID, userId: TARGET_ID },
        authContext: { isAuthenticated: true, isAnonymous: false, userId: ACTOR_ID },
        server: {},
      },
      createMockReply()
    );

    const left = emitted.find((e) => e.event === 'conversation:participant-left')!;
    expect(left.payload.memberCount).toBe(199);
    expect(left.payload.memberCountCapped).toBe(true);
  });

  it('sert l\'effectif ENTIER des restants à l\'admin du GROUPE', async () => {
    emitted = [];
    prisma = createMockPrisma([
      { id: 'p-actor', userId: ACTOR_ID, role: 'creator', user: { role: 'USER' } },
      ...Array.from({ length: 249 }, (_, i) => ({
        id: `p-big-${i}`,
        userId: null,
        role: 'member',
        user: null,
      })),
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
      .mockResolvedValue(targetParticipant({ id: 'p-removed', displayName: 'Removed User' }));

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
    expect(left).toHaveLength(2);
    expect(left[0].payload.memberCount).toBe(199);
    expect(left[0].excepts).toEqual([`user:${ACTOR_ID}`]);
    expect(left[1].rooms).toEqual([`user:${ACTOR_ID}`]);
    expect(left[1].payload.memberCount).toBe(250);
    expect(left[1].payload.memberCountCapped).toBeUndefined();
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
