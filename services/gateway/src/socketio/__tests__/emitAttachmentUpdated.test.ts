import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitAttachmentUpdated } from '../emitAttachmentUpdated';

type Emitted = { rooms: string[]; event: string; payload: unknown };
type Enqueued = { userId: string; entry: any };

const THREE = [
  { id: 'participant-A', userId: 'user-A' },
  { id: 'participant-B', userId: 'user-B' },
  { id: 'participant-C', userId: null },
];

function makeDeps(
  participants: Array<{ id: string; userId: string | null }> = THREE,
  online: string[] = [],
  overrides: Partial<{ findMany: any; enqueue: any; emitThrows: boolean }> = {},
) {
  const emitted: Emitted[] = [];
  const enqueued: Enqueued[] = [];

  // Mirrors Socket.IO's BroadcastOperator: `to()` accumulates rooms and the
  // final `emit()` delivers ONCE per socket across the whole chain.
  const makeOperator = (rooms: string[]) => ({
    to: (room: string) => makeOperator([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      // #17026 — `emit` LÈVE quand l'adaptateur ou l'encodeur est en défaut :
      // c'est une affirmation du dépôt (`emitWithSeq`), pas une hypothèse.
      if (overrides.emitThrows) throw new Error('adapter down');
      emitted.push({ rooms, event, payload });
    },
  });

  const findMany = overrides.findMany ?? jest.fn(async () => participants);
  const enqueue =
    overrides.enqueue ??
    jest.fn(async (userId: string, entry: any) => {
      enqueued.push({ userId, entry });
    });

  return {
    emitted,
    enqueued,
    findMany,
    enqueue,
    deps: {
      io: { to: (room: string) => makeOperator([room]) } as any,
      // #12822 — le régime du message décide du sceau de la file : une conversation en clair ici.
      prisma: { participant: { findMany }, message: { findUnique: async () => ({ encryptionMode: null, conversation: { encryptionMode: null } }) } } as any,
      deliveryQueue: { enqueue } as any,
      connectedUsers: new Map(online.map((u) => [u, {}])) as any,
    },
  };
}

const ATTACHMENT = {
  id: 'att-1',
  messageId: 'msg-1',
  fileUrl: 'https://cdn/voice.m4a',
  mimeType: 'audio/m4a',
  fileSize: 100,
  createdAt: new Date(),
  transcription: { text: 'Hi' },
  translations: { en: { url: 'https://cdn/en.mp3' } },
  // Un lecteur a réagi : c'est ce que la pièce porte EN BASE, et ce que le
  // sérialiseur doit refuser de transformer en champ par lecteur (#18622).
  reactions: [{ emoji: '🔥', participantId: 'participant-B' }],
} as Record<string, unknown>;

describe('emitAttachmentUpdated — the live audience', () => {
  it('emits message:attachment-updated with the serialized attachment', async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED);
    const payload = emitted[0].payload as {
      conversationId: string;
      messageId: string;
      attachment: { transcription: unknown; translations: unknown };
    };
    expect(payload.conversationId).toBe('conv-1');
    expect(payload.messageId).toBe('msg-1');
    expect(payload.attachment.transcription).toEqual({ text: 'Hi' });
    expect(payload.attachment.translations).toEqual({ en: { url: 'https://cdn/en.mp3' } });
  });

  /**
   * #18622 — la charge est PARTAGÉE : une seule est construite, pour la room de
   * la conversation, les rooms personnelles ET la file hors ligne. Elle ne peut
   * donc porter aucun champ PAR LECTEUR.
   *
   * `currentUserReactions` en était un, servi `[]` faute de lecteur à nommer —
   * et `[]` dit « il n'y en a pas », pas « je n'ai pas calculé ». Le web
   * FUSIONNE cette charge et ne préserve que `transcription` et `translations`,
   * et seulement sur `null` : les réactions du lecteur sur sa propre pièce
   * disparaissaient à chaque enrichissement du vocal.
   *
   * Le témoin interroge la PRÉSENCE DE LA CLÉ, jamais sa valeur : une clé
   * présente à `undefined` écrase tout autant dans un `{ ...cached, ...incoming }`.
   */
  it("ne porte AUCUN champ par lecteur — la charge est partagée (#18622)", async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    const attachment = (emitted[0].payload as { attachment: Record<string, unknown> }).attachment;
    expect('currentUserReactions' in attachment).toBe(false);
    // L'agrégat PARTAGÉ voyage, lui : c'est un compte, pas une appartenance, et
    // le retirer avec l'autre retirerait la pastille elle-même.
    expect(attachment.reactionSummary).toEqual({ '🔥': 1 });
  });

  /**
   * La file hors ligne REMET cette même charge jusqu'à 48 h plus tard : si la
   * clé y était, le défaut survivrait à la reconnexion du lecteur — et il est
   * alors PIRE, puisque le lecteur a pu réagir entre-temps depuis un autre
   * appareil.
   */
  it("n'enfile pas davantage de champ par lecteur (#18622)", async () => {
    const { enqueued, deps } = makeDeps(THREE, []);

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    expect(enqueued.length).toBeGreaterThan(0);
    for (const { entry } of enqueued) {
      expect('currentUserReactions' in (entry.payload.attachment as Record<string, unknown>)).toBe(false);
    }
  });

  it('carries `attachmentId` at the top level — the native Android decoder requires it (#11264)', async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    const payload = emitted[0].payload as { attachmentId?: string; attachment: { id: string } };
    expect(payload.attachmentId).toBe(payload.attachment.id);
    expect(typeof payload.attachmentId).toBe('string');
  });

  it('reaches the personal room of every participant, not only the conversation room', async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // A client that has not opened this thread since launch joined NO
    // `conversation:<id>` room — its only room is the personal one. Without it
    // the enrichment (transcription, translated audio) never lands until an
    // unrelated refetch, so the Prisme depended on whether the reader happened
    // to have the thread open.
    expect(emitted[0].rooms).toEqual([
      'conversation:conv-1',
      'user:user-A',
      'user:user-B',
      'user:participant-C',
    ]);
  });

  it('chains the rooms in ONE emit so a socket in both receives a single copy', async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    expect(emitted).toHaveLength(1);
  });

  it('still emits to the conversation room when the AUDIENCE lookup alone fails', async () => {
    // Deux pannes distinctes vivaient sous un double qui faisait LEVER toute
    // requête participant, et elles s'arbitrent à l'OPPOSÉ (#18613). Celle-ci
    // est la liste des rooms personnelles : la loi du plancher, elle, a
    // répondu — personne n'est arrivé après le message — donc toute la room a
    // le droit de lire, et dégrader vers elle ne sert rien à personne sans
    // droit. Le double ne fait donc tomber QUE la requête d'audience (celle
    // dont le `select` ne porte pas les colonnes de plancher).
    const { emitted, deps } = makeDeps(THREE, [], {
      findMany: jest.fn(async (args: any) => {
        if (!args?.select?.joinedAt) throw new Error('mongo down');
        return [];
      }),
    });

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // Degrading to the previous audience beats emitting nothing: the readers
    // sitting IN the conversation are the ones watching the media right now.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toEqual(['conversation:conv-1']);
  });

  it("n'émet RIEN quand c'est la LOI du plancher qui tombe", async () => {
    const { emitted, enqueued, deps } = makeDeps(THREE, [], {
      findMany: jest.fn(async () => {
        throw new Error('mongo down');
      }),
    });

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // L'autre moitié de l'arbitrage ci-dessus, posée ici pour que les deux se
    // lisent côte à côte : une loi illisible ne dit NI qui est bloqué, NI qui
    // est autorisé, et la room contient peut-être un lecteur sous plancher.
    // Détail et non-régression par audience : `emitAttachmentUpdated.historyFloor.test.ts`.
    expect(emitted).toEqual([]);
    expect(enqueued).toEqual([]);
  });
});

describe('emitAttachmentUpdated — the offline audience', () => {
  it('queues the enrichment for every offline participant', async () => {
    const { enqueued, deps } = makeDeps(THREE, ['user-A']);

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    expect(enqueued.map((e) => e.userId).sort()).toEqual(['participant-C', 'user-B']);
    expect(enqueued[0].entry.eventType).toBe('attachment-updated');
    expect(enqueued[0].entry.messageId).toBe('msg-1');
    expect(enqueued[0].entry.conversationId).toBe('conv-1');
  });

  it('queues the AUTHOR too — the enrichment has no actor to exclude', async () => {
    const { enqueued, deps } = makeDeps(THREE);

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // Whisper and NLLB are not people. Everyone learns the transcription,
    // including whoever recorded the voice note — their own copy carries none
    // of it at send time.
    expect(enqueued.map((e) => e.userId).sort()).toEqual(['participant-C', 'user-A', 'user-B']);
  });

  it('scopes the dedup identity to the ATTACHMENT so two attachments never collapse', async () => {
    const { enqueued, deps } = makeDeps(THREE);

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });
    await emitAttachmentUpdated({
      ...deps,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachment: { ...ATTACHMENT, id: 'att-2' },
    });

    // The default (messageId, eventType) identity would supersede the first
    // attachment's enrichment with the second's — one voice note in a two-audio
    // message would replay forever without its transcription.
    const keys = [...new Set(enqueued.map((e) => e.entry.dedupKey))].sort();
    expect(keys).toEqual(['att-1', 'att-2']);
  });

  it('reuses the participants it just loaded instead of querying twice', async () => {
    const { findMany, deps } = makeDeps();

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // Compté sur la requête d'AUDIENCE, pas sur l'appel : la loi du plancher
    // ouvre ses propres lectures (#18613), et les compter ensemble ferait de ce
    // témoin un compteur de requêtes au lieu d'une garde contre la seconde
    // lecture de la MÊME liste pour alimenter la file.
    const audience = (findMany as any).mock.calls.filter(([args]: [any]) => !args?.select?.joinedAt);
    expect(audience).toHaveLength(1);
  });

  it('never throws when the queue is down — the live emit already happened', async () => {
    const { emitted, deps } = makeDeps(THREE, [], {
      enqueue: jest.fn(async () => {
        throw new Error('redis down');
      }),
    });

    await expect(
      emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT }),
    ).resolves.toBeUndefined();
    expect(emitted).toHaveLength(1);
  });

  it('emits live even with no delivery queue configured', async () => {
    const { emitted, deps } = makeDeps();

    await emitAttachmentUpdated({
      ...deps,
      deliveryQueue: null,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachment: ATTACHMENT,
    });

    expect(emitted).toHaveLength(1);
  });
});

/**
 * #16687 — la porte de joignabilité vaut aussi sur CE transport, et c'est ici
 * qu'elle était morte.
 *
 * `MeeshySocketIOHandler` alimentait les quatre chemins média
 * (`startMediaReadyListener`, `gatewayLocalMediaRenderer`,
 * `startGatewayPendingSweep`, `mediaReadyPorts().emitAttachmentUpdated`) avec
 * `connectedUsers: () => new Set(manager.getConnectedUsers())`. Un
 * `Set<string>` répond `has` et n'a pas `get` : le marqueur était illisible, et
 * la file n'enfilait pas pour une socket pourtant absente de la room.
 *
 * Concrètement : Whisper finit la transcription d'un vocal, le
 * `message:attachment-updated` part sur la room que le destinataire n'a pas pu
 * rejoindre, et rien n'est enfilé. Ni émission vive, ni rejeu — le défaut même
 * que #16687 nomme, sur le transport qu'il ne couvrait pas.
 *
 * Le contrat exige maintenant `get` (`ReachabilityView`), si bien que la forme
 * `Set` ne compile plus ; ce témoin garde le COMPORTEMENT, le compilateur garde
 * la FORME.
 */
describe('emitAttachmentUpdated — joignabilité par conversation (#16687)', () => {
  it('enfile pour une socket connectée dont la room de CETTE conversation a échoué', async () => {
    const { enqueued, deps } = makeDeps(THREE, ['user-B']);
    (deps.connectedUsers as Map<string, unknown>).set('user-B', {
      unreachableConversations: new Set(['conv-1']),
    });

    await emitAttachmentUpdated({
      ...deps,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachment: ATTACHMENT as any,
    });

    // Pas d'exclusion d'acteur sur ce transport : un média qui devient prêt
    // n'est le geste de personne, donc `user-A` est un destinataire comme un
    // autre. Ce qui se juge ici est la présence de `user-B`, marqué injoignable.
    expect(enqueued.map((e) => e.userId).sort()).toEqual(['participant-C', 'user-A', 'user-B']);
  });

  it("n'enfile PAS pour une socket dont une AUTRE conversation a échoué", async () => {
    const { enqueued, deps } = makeDeps(THREE, ['user-B']);
    (deps.connectedUsers as Map<string, unknown>).set('user-B', {
      unreachableConversations: new Set(['conv-autre']),
    });

    await emitAttachmentUpdated({
      ...deps,
      conversationId: 'conv-1',
      messageId: 'msg-1',
      attachment: ATTACHMENT as any,
    });

    expect(enqueued.map((e) => e.userId).sort()).toEqual(['participant-C', 'user-A']);
  });
});

/**
 * #17026 — « Best-effort side channel — never throws » était FAUX.
 *
 * Les deux branches d'émission de cette unité peuvent lever (`emit` en défaut
 * d'adaptateur ou d'encodeur ; `emitToConversationParticipants` n'a aucun
 * `try`), et l'exception remontait à l'appelant CONTRE la promesse du
 * doc-comment — en emportant au passage l'enfilage hors ligne qui la suit,
 * c'est-à-dire la pièce ENRICHIE : la transcription et sa piste traduite, la
 * raison d'être du module.
 *
 * Un commentaire qui ÉNONCE une contrainte est une AFFIRMATION, et se vérifie
 * comme telle (cycle 94). Les deux témoins ci-dessous la vérifient : l'un sur
 * la promesse (« ne lève pas »), l'autre sur ce qu'elle protège (« l'absent est
 * servi »). Séparés, parce que la première peut tenir alors que la seconde est
 * perdue — un `try` posé autour du tout, enfilage compris, satisferait l'un et
 * trahirait l'autre.
 */
describe('#17026 — une émission vivante qui LÈVE', () => {
  it('ne remonte pas chez l’appelant : le doc-comment promet « never throws »', async () => {
    const { deps } = makeDeps(THREE, [], { emitThrows: true });

    await expect(
      emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT }),
    ).resolves.toBeUndefined();
  });

  it('n’emporte pas l’enfilage hors ligne — la pièce ENRICHIE atteint l’absent', async () => {
    const { enqueued, deps } = makeDeps(THREE, [], { emitThrows: true });

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // Les trois participants sont hors ligne (`online: []`) : chacun a son
    // entrée. Sans la garde, aucun ne l'avait.
    expect(enqueued.map((e) => e.userId).sort()).toEqual(['participant-C', 'user-A', 'user-B']);
  });
});
