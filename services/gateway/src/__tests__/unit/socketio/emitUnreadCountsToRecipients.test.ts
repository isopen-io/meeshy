/**
 * `emitUnreadCountsToRecipients` — ce que TOUT message committé doit à ses
 * DESTINATAIRES : la pastille de non-lus, quel que soit le tuyau d'arrivée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { emitUnreadCountsToRecipients } from '../../../socketio/emitUnreadCountsToRecipients';

const CONV_ID = '507f1f77bcf86cd799439022';
const SENDER_PART_ID = '507f1f77bcf86cd799439031';
const SENDER_USER_ID = '507f1f77bcf86cd799439041';
const PEER_PART_ID = '507f1f77bcf86cd799439032';
const PEER_USER_ID = '507f1f77bcf86cd799439042';
const ANON_PART_ID = '507f1f77bcf86cd799439033';

type Participant = { id: string; userId: string | null; joinedAt: Date | null };

function makeIO() {
  const emit = jest.fn<any>();
  const to = jest.fn<any>(() => ({ emit }));
  return { io: { to }, to, emit };
}

function makePrisma(participants: Participant[]) {
  return {
    participant: { findMany: jest.fn<any>().mockResolvedValue(participants) },
  };
}

function makeReadStatusService(counts: Record<string, number> = {}) {
  return {
    getUnreadCountsForParticipants: jest
      .fn<any>()
      .mockResolvedValue(new Map(Object.entries(counts))),
  };
}

function sender(overrides: Partial<Participant> = {}): Participant {
  return { id: SENDER_PART_ID, userId: SENDER_USER_ID, joinedAt: null, ...overrides };
}

function peer(overrides: Partial<Participant> = {}): Participant {
  return { id: PEER_PART_ID, userId: PEER_USER_ID, joinedAt: null, ...overrides };
}

describe('emitUnreadCountsToRecipients — la pastille', () => {
  it('émet le compteur de chaque destinataire dans sa room personnelle', async () => {
    const { io, to, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 7 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(to).toHaveBeenCalledWith(`user:${PEER_USER_ID}`);
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 7,
    });
  });

  // Un participant absent de la Map n'est pas « inconnu » : c'est un participant
  // à jour, dont le compteur vaut zéro. Ne rien émettre laisserait sa pastille
  // afficher son ancienne valeur — exactement le mensonge que ce push corrige.
  it('émet zéro pour un destinataire absent de la table des compteurs', async () => {
    const { io, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService(),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 0,
    });
  });
});

describe('emitUnreadCountsToRecipients — exclusion de l\'expéditeur', () => {
  // `senderId` est un `Participant.id` sur les transports REST/ZMQ et lien.
  it('n\'émet rien vers l\'auteur identifié par son id de participant', async () => {
    const { io, to } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 1 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(to).not.toHaveBeenCalledWith(`user:${SENDER_USER_ID}`);
    expect(to).toHaveBeenCalledTimes(1);
  });

  // ...et un `User.id` sur le transport WS. Un seul des deux prédicats couvre
  // un seul des deux transports : l'auteur recevrait sinon la pastille de son
  // PROPRE message, que le décompte n'inclut d'ailleurs pas — un « 0 » poussé
  // à l'auteur écrase la pastille légitime de ses messages non lus antérieurs.
  it('n\'émet rien vers l\'auteur identifié par son id d\'utilisateur', async () => {
    const { io, to } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 1 }),
      conversationId: CONV_ID,
      senderId: SENDER_USER_ID,
    });

    expect(to).not.toHaveBeenCalledWith(`user:${SENDER_USER_ID}`);
    expect(to).toHaveBeenCalledTimes(1);
  });

  it('ne demande aucun compteur quand l\'auteur est le seul participant actif', async () => {
    const { io, to } = makeIO();
    const readStatusService = makeReadStatusService();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender()]) as any,
      readStatusService,
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(readStatusService.getUnreadCountsForParticipants).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });

  it('ne fait rien sans auteur — aucun destinataire n\'est déductible', async () => {
    const { io, to } = makeIO();
    const prisma = makePrisma([sender(), peer()]);

    await emitUnreadCountsToRecipients({
      io,
      prisma: prisma as any,
      readStatusService: makeReadStatusService(),
      conversationId: CONV_ID,
      senderId: null,
    });

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    expect(to).not.toHaveBeenCalled();
  });
});

describe('emitUnreadCountsToRecipients — participants anonymes', () => {
  // Une conversation ouverte par lien de partage est peuplée de participants
  // SANS `User.id`. Sans ce repli, la population même de ce transport ne
  // recevrait jamais de pastille.
  it('adresse un participant sans compte par son id de participant', async () => {
    const { io, to, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), { id: ANON_PART_ID, userId: null, joinedAt: null }]) as any,
      readStatusService: makeReadStatusService({ [ANON_PART_ID]: 3 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(to).toHaveBeenCalledWith(`user:${ANON_PART_ID}`);
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 3,
    });
  });
});

describe('emitUnreadCountsToRecipients — source des participants', () => {
  it('ne lit que les participants actifs de la conversation', async () => {
    const { io } = makeIO();
    const prisma = makePrisma([sender(), peer()]);

    await emitUnreadCountsToRecipients({
      io,
      prisma: prisma as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 1 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(prisma.participant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { conversationId: CONV_ID, isActive: true },
        select: { id: true, userId: true, joinedAt: true },
      })
    );
  });

  // Le manager et `MessageHandler` chargent déjà cette liste pour
  // `conversation:updated` et la file hors ligne. Une requête de plus tomberait
  // sur le chemin le plus chaud du service, à chaque message.
  it('réutilise la liste préchargée sans relire la base', async () => {
    const { io, to } = makeIO();
    const prisma = makePrisma([]);

    await emitUnreadCountsToRecipients({
      io,
      prisma: prisma as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 2 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      participants: [sender(), peer()],
    });

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
    expect(to).toHaveBeenCalledWith(`user:${PEER_USER_ID}`);
  });

  // Le curseur de comptage retombe sur `joinedAt` quand le participant n'a
  // jamais lu : le tronquer ferait compter tout l'historique d'avant son
  // arrivée comme non lu.
  it('transmet le joinedAt de chaque destinataire au calcul du compteur', async () => {
    const { io } = makeIO();
    const joinedAt = new Date('2026-01-01T00:00:00.000Z');
    const readStatusService = makeReadStatusService({ [PEER_PART_ID]: 1 });

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer({ joinedAt })]) as any,
      readStatusService,
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(readStatusService.getUnreadCountsForParticipants).toHaveBeenCalledWith(
      [expect.objectContaining({ id: PEER_PART_ID, joinedAt })],
      CONV_ID
    );
  });
});

describe('emitUnreadCountsToRecipients — le pont ✦ par destinataire (G-123)', () => {
  function makeBridgeService(map: Map<string, { bridge: unknown; lastReadAt?: Date }>) {
    return { buildBridgeData: jest.fn<any>().mockResolvedValue(map) };
  }

  it('enrichit le payload du destinataire dont le service rend un pont', async () => {
    const { io, emit } = makeIO();
    const bridge = {
      kind: 'fallback',
      unreadCount: 3,
      suggestedMode: 'focal',
      data: { authors: ['Bob'], extraAuthorCount: 0, messageCount: 3 },
    };
    const bridgeService = makeBridgeService(new Map([[CONV_ID, { bridge }]]));

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 3 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService,
    });

    // Candidat SINGLETON — une conversation, jamais la liste entière : le
    // pont d'UN destinataire ne recalcule que CE destinataire.
    expect(bridgeService.buildBridgeData).toHaveBeenCalledWith({
      viewerId: PEER_USER_ID,
      candidates: [{ conversationId: CONV_ID, unreadCount: 3 }],
    });
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 3,
      bridge,
    });
  });

  it("n'appelle pas le constructeur de pont pour un destinataire à zéro non-lu", async () => {
    const { io, emit } = makeIO();
    const bridgeService = makeBridgeService(new Map());

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService(), // aucune entrée ⇒ 0
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService,
    });

    expect(bridgeService.buildBridgeData).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 0,
    });
  });

  it('reste exactement { conversationId, unreadCount } sans bridgeService — comportement historique intact', async () => {
    const { io, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 5 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 5,
    });
  });

  it("n'ajoute pas bridge, et n'empêche pas l'émission du compteur, quand le pont échoue", async () => {
    const { io, emit } = makeIO();
    const onError = jest.fn();
    const bridgeService = { buildBridgeData: jest.fn<any>().mockRejectedValue(new Error('bridge down')) };

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 2 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService,
      onError,
    });

    expect(onError).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 2,
    });
  });

  it('recalcule un pont DISTINCT par destinataire — le pont est par lecteur, jamais partagé', async () => {
    const { io, emit } = makeIO();
    const bridgeForPeer = { kind: 'fallback', unreadCount: 1, suggestedMode: 'focal', data: { authors: [], extraAuthorCount: 0, messageCount: 1 } };
    const buildBridgeData = jest
      .fn<any>()
      .mockImplementation(async ({ viewerId }: { viewerId: string }) =>
        viewerId === PEER_USER_ID ? new Map([[CONV_ID, { bridge: bridgeForPeer }]]) : new Map()
      );

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer(), { id: ANON_PART_ID, userId: null, joinedAt: null }]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 1, [ANON_PART_ID]: 1 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService: { buildBridgeData },
    });

    expect(buildBridgeData).toHaveBeenCalledWith({ viewerId: PEER_USER_ID, candidates: [{ conversationId: CONV_ID, unreadCount: 1 }] });
    expect(buildBridgeData).toHaveBeenCalledWith({ viewerId: ANON_PART_ID, candidates: [{ conversationId: CONV_ID, unreadCount: 1 }] });
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', { conversationId: CONV_ID, unreadCount: 1, bridge: bridgeForPeer });
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', { conversationId: CONV_ID, unreadCount: 1 });
  });
});

describe('emitUnreadCountsToRecipients — best-effort', () => {
  it('ne rejette pas quand le calcul des compteurs échoue, et signale l\'erreur', async () => {
    const { io } = makeIO();
    const boom = new Error('cursors unavailable');
    const onError = jest.fn();

    await expect(
      emitUnreadCountsToRecipients({
        io,
        prisma: makePrisma([sender(), peer()]) as any,
        readStatusService: {
          getUnreadCountsForParticipants: jest.fn<any>().mockRejectedValue(boom),
        },
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        onError,
      })
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('ne rejette pas quand la lecture des participants échoue', async () => {
    const { io } = makeIO();
    const onError = jest.fn();

    await expect(
      emitUnreadCountsToRecipients({
        io,
        prisma: { participant: { findMany: jest.fn<any>().mockRejectedValue(new Error('db down')) } } as any,
        readStatusService: makeReadStatusService(),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
        onError,
      })
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalled();
  });

  // Le manager expose `getIO()` qui rend `null` tant que Socket.IO n'est pas
  // démarré : un envoi REST pendant le boot ne doit pas devenir un 500.
  it('ne rejette pas sans serveur Socket.IO, et n\'interroge pas la base', async () => {
    const prisma = makePrisma([sender(), peer()]);

    await expect(
      emitUnreadCountsToRecipients({
        io: null,
        prisma: prisma as any,
        readStatusService: makeReadStatusService(),
        conversationId: CONV_ID,
        senderId: SENDER_PART_ID,
      })
    ).resolves.toBeUndefined();

    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });
});
