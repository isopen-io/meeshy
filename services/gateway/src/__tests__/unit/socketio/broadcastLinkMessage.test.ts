/**
 * `broadcastLinkMessage` — les TROIS audiences d'un message envoyé par lien de
 * partage (la room live, la file hors ligne, la pastille de non-lus), plus le
 * seul signal qu'il doive à son propre AUTEUR : l'accusé de livraison.
 *
 * Canal best-effort : le message est déjà committé quand ceci tourne, donc
 * aucune panne d'audience ne doit ni rejeter, ni empêcher les autres.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

import { broadcastLinkMessage } from '../../../socketio/broadcastLinkMessage';

const CONV_ID = '507f1f77bcf86cd799439022';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439033';

const PAYLOAD = { message: { id: MSG_ID, conversationId: CONV_ID } };

function makeManager(overrides: Record<string, unknown> = {}) {
  const emit = jest.fn<any>();
  const to = jest.fn<any>(() => ({ emit }));
  const enqueueOfflineLinkMessage = jest.fn<any>().mockResolvedValue(undefined);
  const emitUnreadCountsToRecipients = jest.fn<any>().mockResolvedValue(undefined);
  const autoDeliverToOnlineRecipients = jest.fn<any>().mockResolvedValue(undefined);
  const manager = {
    getIO: () => ({ to }),
    enqueueOfflineLinkMessage,
    emitUnreadCountsToRecipients,
    autoDeliverToOnlineRecipients,
    ...overrides,
  };
  return {
    manager,
    to,
    emit,
    enqueueOfflineLinkMessage,
    emitUnreadCountsToRecipients,
    autoDeliverToOnlineRecipients,
  };
}

const call = (manager: unknown, onError?: (e: unknown) => void) =>
  broadcastLinkMessage({
    manager: manager as never,
    conversationId: CONV_ID,
    senderParticipantId: PART_ID,
    messageId: MSG_ID,
    payload: PAYLOAD,
    onError,
  });

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('broadcastLinkMessage — les trois audiences', () => {
  it('annonce le message dans la room de la conversation', async () => {
    const { manager, to, emit } = makeManager();

    await call(manager);

    expect(to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
    expect(emit).toHaveBeenCalledWith('link:message:new', PAYLOAD);
  });

  it('enfile le message pour les participants hors ligne', async () => {
    const { manager, enqueueOfflineLinkMessage } = makeManager();

    await call(manager);

    expect(enqueueOfflineLinkMessage).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      actorParticipantId: PART_ID,
      messageId: MSG_ID,
      payload: PAYLOAD,
    });
  });

  // La room annonce le message et la file le rejoue — ni l'une ni l'autre ne
  // bouge le compteur. Le handler web ne le bouge pas davantage : il n'écrit
  // que l'aperçu et l'horodatage.
  it('pousse une pastille de non-lus fraîche à chaque destinataire', async () => {
    const { manager, emitUnreadCountsToRecipients } = makeManager();

    await call(manager);

    expect(emitUnreadCountsToRecipients).toHaveBeenCalledWith({
      conversationId: CONV_ID,
      senderId: PART_ID,
    });
  });

  // Les trois précédentes servent les DESTINATAIRES. Celle-ci sert l'AUTEUR :
  // sans elle, sa coche reste sur « envoyé » quel que soit le nombre de pairs
  // connectés, parce que l'unité qui la fait avancer est une méthode de
  // `MessageHandler` qu'aucune route ne peut voir.
  it('fait avancer la coche de l\'expéditeur pour les destinataires connectés', async () => {
    const { manager, autoDeliverToOnlineRecipients } = makeManager();

    await call(manager);

    expect(autoDeliverToOnlineRecipients).toHaveBeenCalledWith(
      { id: MSG_ID, senderId: PART_ID },
      CONV_ID
    );
  });

  // `_isSender` accepte les deux représentations, mais l'accusé ne peut exclure
  // l'auteur que si on lui en transmet une : un `senderId` absent ferait sortir
  // `autoDeliverToOnlineRecipients` immédiatement, sans le moindre reçu.
  it('transmet un senderId nul plutôt qu\'undefined quand l\'auteur est inconnu', async () => {
    const { manager, autoDeliverToOnlineRecipients } = makeManager();

    await broadcastLinkMessage({
      manager: manager as never,
      conversationId: CONV_ID,
      senderParticipantId: undefined,
      messageId: MSG_ID,
      payload: PAYLOAD,
    });

    expect(autoDeliverToOnlineRecipients).toHaveBeenCalledWith(
      { id: MSG_ID, senderId: null },
      CONV_ID
    );
  });

  it('ne touche à aucune audience sans manager', async () => {
    await expect(
      broadcastLinkMessage({
        manager: null,
        conversationId: CONV_ID,
        senderParticipantId: PART_ID,
        messageId: MSG_ID,
        payload: PAYLOAD,
      })
    ).resolves.toBeUndefined();
  });
});

describe('broadcastLinkMessage — indépendance des audiences', () => {
  // Le message est déjà committé : une room injoignable ne doit pas priver un
  // participant hors ligne de son rejeu, ni le destinataire de sa pastille.
  it('sert les deux autres audiences quand l\'émission live jette', async () => {
    const boom = new Error('io down');
    const { manager, enqueueOfflineLinkMessage, emitUnreadCountsToRecipients } = makeManager({
      getIO: () => {
        throw boom;
      },
    });
    const onError = jest.fn();

    await call(manager, onError);

    expect(onError).toHaveBeenCalledWith(boom);
    expect(enqueueOfflineLinkMessage).toHaveBeenCalled();
    expect(emitUnreadCountsToRecipients).toHaveBeenCalled();
  });

  it('pousse la pastille quand la mise en file jette', async () => {
    const boom = new Error('redis down');
    const { manager, emitUnreadCountsToRecipients } = makeManager({
      enqueueOfflineLinkMessage: jest.fn<any>(() => {
        throw boom;
      }),
    });
    const onError = jest.fn();

    await call(manager, onError);

    expect(onError).toHaveBeenCalledWith(boom);
    expect(emitUnreadCountsToRecipients).toHaveBeenCalled();
  });

  it('ne rejette pas quand la pastille jette de façon synchrone', async () => {
    const boom = new Error('no manager surface');
    const { manager } = makeManager({
      emitUnreadCountsToRecipients: jest.fn<any>(() => {
        throw boom;
      }),
    });
    const onError = jest.fn();

    await expect(call(manager, onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
  });

  // L'accusé est le dernier des quatre : rien ne le suit, donc seule cette
  // garde empêche un manager partiel (version antérieure, double de test) de
  // transformer un envoi abouti en 500.
  it('ne rejette pas quand l\'accusé jette de façon synchrone', async () => {
    const boom = new Error('no receipt surface');
    const { manager, emitUnreadCountsToRecipients } = makeManager({
      autoDeliverToOnlineRecipients: jest.fn<any>(() => {
        throw boom;
      }),
    });
    const onError = jest.fn();

    await expect(call(manager, onError)).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(boom);
    expect(emitUnreadCountsToRecipients).toHaveBeenCalled();
  });

  // Et symétriquement : une panne de l'accusé ne doit priver aucune des trois
  // audiences, ni une panne d'audience priver l'expéditeur de sa coche.
  it('sert l\'accusé quand la pastille jette', async () => {
    const { manager, autoDeliverToOnlineRecipients } = makeManager({
      emitUnreadCountsToRecipients: jest.fn<any>(() => {
        throw new Error('badge down');
      }),
    });

    await call(manager, jest.fn());

    expect(autoDeliverToOnlineRecipients).toHaveBeenCalled();
  });

  // `void promesse` sans `.catch` termine le processus sous le
  // `--unhandled-rejections=throw` par défaut de Node 22 — les trois canaux
  // fire-and-forget doivent donc attacher le leur.
  it('capture le rejet asynchrone de chacun des trois canaux différés', async () => {
    const queueBoom = new Error('queue rejected');
    const badgeBoom = new Error('badge rejected');
    const receiptBoom = new Error('receipt rejected');
    const { manager } = makeManager({
      enqueueOfflineLinkMessage: jest.fn<any>().mockRejectedValue(queueBoom),
      emitUnreadCountsToRecipients: jest.fn<any>().mockRejectedValue(badgeBoom),
      autoDeliverToOnlineRecipients: jest.fn<any>().mockRejectedValue(receiptBoom),
    });
    const onError = jest.fn();

    await call(manager, onError);
    await flush();

    expect(onError).toHaveBeenCalledWith(queueBoom);
    expect(onError).toHaveBeenCalledWith(badgeBoom);
    expect(onError).toHaveBeenCalledWith(receiptBoom);
  });
});
