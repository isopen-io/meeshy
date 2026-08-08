/**
 * `broadcastLinkMessage` — les TROIS audiences d'un message envoyé par lien de
 * partage : la room live, la file hors ligne, et la pastille de non-lus.
 *
 * Canal best-effort : le message est déjà committé quand ceci tourne, donc
 * aucune panne d'audience ne doit ni rejeter, ni empêcher les deux autres.
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
  const manager = {
    getIO: () => ({ to }),
    enqueueOfflineLinkMessage,
    emitUnreadCountsToRecipients,
    ...overrides,
  };
  return { manager, to, emit, enqueueOfflineLinkMessage, emitUnreadCountsToRecipients };
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

  // `void promesse` sans `.catch` termine le processus sous le
  // `--unhandled-rejections=throw` par défaut de Node 22 — les deux canaux
  // fire-and-forget doivent donc attacher le leur.
  it('capture le rejet asynchrone de chacun des deux canaux différés', async () => {
    const queueBoom = new Error('queue rejected');
    const badgeBoom = new Error('badge rejected');
    const { manager } = makeManager({
      enqueueOfflineLinkMessage: jest.fn<any>().mockRejectedValue(queueBoom),
      emitUnreadCountsToRecipients: jest.fn<any>().mockRejectedValue(badgeBoom),
    });
    const onError = jest.fn();

    await call(manager, onError);
    await flush();

    expect(onError).toHaveBeenCalledWith(queueBoom);
    expect(onError).toHaveBeenCalledWith(badgeBoom);
  });
});
