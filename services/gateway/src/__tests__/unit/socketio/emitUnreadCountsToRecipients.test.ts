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

    // Le sujet du témoin est le COMPTEUR, pas la forme du pont : `objectContaining`,
    // pour qu'il ne fige pas une forme dont il ne parle pas (leçon du cycle 62).
    expect(emit).toHaveBeenCalledWith(
      'conversation:unread-updated',
      expect.objectContaining({ conversationId: CONV_ID, unreadCount: 0 })
    );
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
    return { buildBridgeDataForViewers: jest.fn<any>().mockResolvedValue(map) };
  }

  it('enrichit le payload du destinataire dont le service rend un pont', async () => {
    const { io, emit } = makeIO();
    const bridge = {
      kind: 'fallback',
      unreadCount: 3,
      suggestedMode: 'focal',
      data: { authors: ['Bob'], extraAuthorCount: 0, messageCount: 3 },
    };
    const bridgeService = makeBridgeService(new Map([[PEER_USER_ID, { bridge }]]));

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 3 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService,
    });

    // UNE conversation, le LOT des destinataires : le pont reste calculé par
    // lecteur, mais il n'est plus demandé lecteur par lecteur (REV-5/B2).
    expect(bridgeService.buildBridgeDataForViewers).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      viewers: [{ viewerId: PEER_USER_ID, unreadCount: 3 }],
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

    // Le service n'est pas appelé — mais la réponse est CONNUE sans lui
    // (contrat gelé §3.2 : un compteur à zéro n'a pas de pont). L'émetteur
    // l'ANNONCE donc, `bridge: null`, au lieu de se taire : c'est ce qui
    // retire le pont périmé de la ligne d'un lecteur qui vient de rattraper.
    expect(bridgeService.buildBridgeDataForViewers).not.toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 0,
      bridge: null,
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
    const bridgeService = {
      buildBridgeDataForViewers: jest.fn<any>().mockRejectedValue(new Error('bridge down')),
    };

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 2 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService,
      onError,
    });

    // Le champ est ABSENT — pas `null`. La passe a échoué : l'émetteur ne
    // sait PAS s'il y a un pont, et l'égalité stricte de `toHaveBeenCalledWith`
    // prouve ici que la clé ne voyage pas. Un `null` dirait « il n'y en a
    // pas » et effacerait le pont que le lecteur a peut-être déjà en cache.
    expect(onError).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 2,
    });
  });

  // Un pont par lecteur, jamais partagé — mais UN SEUL appel pour tout
  // l'événement : c'est ce couple (par lecteur, en un lot) que REV-5/B2
  // exige. Un lecteur absent de la map rendue n'a rien à annoncer et repart
  // avec son compteur nu.
  it('demande les ponts de TOUS les destinataires en UN appel, et les rend distincts', async () => {
    const { io, emit } = makeIO();
    const bridgeForPeer = { kind: 'fallback', unreadCount: 1, suggestedMode: 'focal', data: { authors: [], extraAuthorCount: 0, messageCount: 1 } };
    const buildBridgeDataForViewers = jest
      .fn<any>()
      .mockResolvedValue(new Map([[PEER_USER_ID, { bridge: bridgeForPeer }]]));

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer(), { id: ANON_PART_ID, userId: null, joinedAt: null }]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 1, [ANON_PART_ID]: 1 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService: { buildBridgeDataForViewers },
    });

    expect(buildBridgeDataForViewers).toHaveBeenCalledTimes(1);
    expect(buildBridgeDataForViewers).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      viewers: [
        { viewerId: PEER_USER_ID, unreadCount: 1 },
        { viewerId: ANON_PART_ID, unreadCount: 1 },
      ],
    });
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', { conversationId: CONV_ID, unreadCount: 1, bridge: bridgeForPeer });
    // Le lecteur absent de la map rendue a été SOUMIS à la passe, qui n'a rien
    // trouvé pour lui : c'est une réponse, pas un silence.
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', { conversationId: CONV_ID, unreadCount: 1, bridge: null });
  });
});

/**
 * Le fil porte TROIS états, pas deux (cycle 63).
 *
 * `bridge` a longtemps eu deux formes sur le fil — présent ou absent — pour
 * exprimer trois choses : « voici le pont », « il n'y en a pas », et « je ne
 * l'ai pas calculé ». Les deux clients recopient le champ INCONDITIONNELLEMENT
 * (`ConversationSyncEngine.handleUnreadUpdated`, `setConversationUnreadInCache`),
 * si bien que le troisième cas — un émetteur qui n'a rien calculé — sortait sur
 * le fil sous la forme du deuxième et EFFAÇAIT le pont en cache.
 *
 * Le vocabulaire manquant, c'est `null` :
 *   - `bridge: <objet>` → voici le pont de CE lecteur ;
 *   - `bridge: null`    → j'ai calculé, il n'y en a pas ⇒ efface ;
 *   - clé ABSENTE       → je n'ai pas calculé ⇒ garde ce que tu as.
 *
 * Ce bloc garde la frontière entre les deux dernières formes sur le fan-out
 * d'envoi ; son jumeau garde l'instantané de reconnexion
 * (`MeeshySocketIOManager.test.ts`, « le pont ✦ voyage aussi sur la forme de
 * reconnexion »).
 */
describe('emitUnreadCountsToRecipients — « pas de pont » et « je ne sais pas » ne sont pas la même phrase', () => {
  const bridgeless = () => ({ buildBridgeDataForViewers: jest.fn<any>().mockResolvedValue(new Map()) });

  it('annonce `bridge: null` quand la passe a tourné et n\'a rien rendu pour ce lecteur', async () => {
    const { io, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService: bridgeless(),
    });

    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONV_ID,
      unreadCount: 4,
      bridge: null,
    });
  });

  it('omet la clé — jamais `null` — quand la passe a ÉCHOUÉ', async () => {
    const { io, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
      bridgeService: { buildBridgeDataForViewers: jest.fn<any>().mockRejectedValue(new Error('down')) },
      onError: jest.fn(),
    });

    expect(emit.mock.calls[0][1]).not.toHaveProperty('bridge');
  });

  it('omet la clé quand l\'appelant ne fournit aucun constructeur de pont', async () => {
    const { io, emit } = makeIO();

    await emitUnreadCountsToRecipients({
      io,
      prisma: makePrisma([sender(), peer()]) as any,
      readStatusService: makeReadStatusService({ [PEER_PART_ID]: 4 }),
      conversationId: CONV_ID,
      senderId: SENDER_PART_ID,
    });

    expect(emit.mock.calls[0][1]).not.toHaveProperty('bridge');
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
