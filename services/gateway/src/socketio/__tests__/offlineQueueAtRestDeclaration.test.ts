/**
 * #12822 (H2, balayage) — CHAQUE producteur d'une entrée de file hors ligne
 * qui porte du texte de message déclare le régime de sa conversation.
 *
 * Le lien de partage enfilait son enveloppe sans le dire, et l'enveloppe ne
 * porte pas `encryptionMode` : le clair d'une conversation chiffrée au repos
 * partait dans Redis (48 h, AOF). La déclaration `atRest` est désormais REQUISE
 * au type pour `new`, `edited`, `translation`, `link-message` et
 * `attachment-updated` : le compilateur énumère les producteurs à notre place,
 * et `tsc -p tsconfig.test.json` (cliquet de #6160) garde les assertions de
 * type ci-dessous. Les témoins de comportement couvrent les deux producteurs
 * qui devaient LIRE le régime pour le déclarer.
 */
import { describe, it, expect, jest } from '@jest/globals';
import type { OfflineParticipantQueueParams } from '../offlineParticipantQueue';
import { enqueueForOfflineParticipants } from '../offlineParticipantQueue';
import { emitAttachmentUpdated } from '../emitAttachmentUpdated';
import { broadcastMessageMutation } from '../broadcastMessageMutation';
import type { QueuedPayloadFor } from '../queuedEventContract';

const CONV = '507f1f77bcf86cd799439011';
const MSG = '507f1f77bcf86cd799439022';
const SECRET = 'la réunion est déplacée, code 4471';

const base = { conversationId: CONV, messageId: MSG } as const;

describe('la déclaration du régime est requise au type', () => {
  it('chaque famille qui porte du texte refuse une entrée sans atRest', () => {
    const declared: OfflineParticipantQueueParams[] = [
      { ...base, payload: {} as QueuedPayloadFor<'new'>, atRest: false },
      { ...base, eventType: 'new', payload: {} as QueuedPayloadFor<'new'>, atRest: true },
      { ...base, eventType: 'edited', payload: {} as QueuedPayloadFor<'edited'>, atRest: false },
      { ...base, eventType: 'translation', payload: {} as QueuedPayloadFor<'translation'>, atRest: true },
      { ...base, eventType: 'link-message', payload: {} as QueuedPayloadFor<'link-message'>, atRest: true },
      { ...base, eventType: 'attachment-updated', payload: {} as QueuedPayloadFor<'attachment-updated'>, atRest: false },
      { ...base, eventType: 'deleted', payload: { messageId: MSG, conversationId: CONV } },
    ];
    // @ts-expect-error — un message:new sans déclaration ne compile pas
    const undeclaredNew: OfflineParticipantQueueParams = { ...base, eventType: 'new', payload: {} as QueuedPayloadFor<'new'> };
    // @ts-expect-error — un message de lien sans déclaration ne compile pas
    const undeclaredLink: OfflineParticipantQueueParams = { ...base, eventType: 'link-message', payload: {} as QueuedPayloadFor<'link-message'> };
    // @ts-expect-error — une traduction sans déclaration ne compile pas
    const undeclaredTranslation: OfflineParticipantQueueParams = { ...base, eventType: 'translation', payload: {} as QueuedPayloadFor<'translation'> };
    // @ts-expect-error — une édition sans déclaration ne compile pas
    const undeclaredEdit: OfflineParticipantQueueParams = { ...base, eventType: 'edited', payload: {} as QueuedPayloadFor<'edited'> };
    // @ts-expect-error — une transcription sans déclaration ne compile pas
    const undeclaredAttachment: OfflineParticipantQueueParams = { ...base, eventType: 'attachment-updated', payload: {} as QueuedPayloadFor<'attachment-updated'> };

    expect(declared).toHaveLength(7);
    expect([undeclaredNew, undeclaredLink, undeclaredTranslation, undeclaredEdit, undeclaredAttachment]).toHaveLength(5);
  });
});

const offlineDeps = () => {
  const enqueue = jest.fn(async (..._args: unknown[]) => undefined);
  return {
    enqueue,
    deps: {
      deliveryQueue: { enqueue },
      prisma: { participant: { findMany: async () => [{ id: 'p-off', userId: 'u-off' }] } } as never,
      connectedUsers: new Set<string>(),
    },
  };
};

const attachmentWorld = (regime: (() => Promise<unknown>)) => {
  const enqueue = jest.fn(async (..._args: unknown[]) => undefined);
  const room = { to: () => room, emit: () => undefined };
  return {
    enqueue,
    run: () => emitAttachmentUpdated({
      io: { to: () => room } as never,
      prisma: {
        participant: { findMany: async () => [{ id: 'p-off', userId: 'u-off' }] },
        message: { findUnique: regime },
        conversationShareLink: { findMany: async () => [] },
      } as never,
      deliveryQueue: { enqueue },
      connectedUsers: new Set<string>(),
      conversationId: CONV,
      messageId: MSG,
      attachment: {
        id: 'att-1', messageId: MSG, fileUrl: 'https://cdn/voice.m4a', mimeType: 'audio/m4a', fileSize: 100,
        createdAt: new Date('2026-10-25T08:00:00Z'), transcription: { text: SECRET },
      },
    }),
  };
};

describe('message:attachment-updated (transcription) lit le régime pour le déclarer', () => {
  it.each(['server', 'hybrid'])('message %s : l’entrée part scellée', async (mode) => {
    const world = attachmentWorld(async () => ({ encryptionMode: mode, conversation: { encryptionMode: mode } }));
    await world.run();
    expect(world.enqueue).toHaveBeenCalledWith('u-off', expect.anything(), { sealAtRest: true });
  });

  it('un message d’avant l’activation, dans une conversation désormais server : scellée aussi', async () => {
    const world = attachmentWorld(async () => ({ encryptionMode: null, conversation: { encryptionMode: 'server' } }));
    await world.run();
    expect(world.enqueue).toHaveBeenCalledWith('u-off', expect.anything(), { sealAtRest: true });
  });

  it('un régime illisible n’enfile RIEN plutôt que le clair', async () => {
    const world = attachmentWorld(async () => { throw new Error('mongo down'); });
    await world.run();
    expect(world.enqueue).not.toHaveBeenCalled();
  });

  it('une conversation en clair enfile comme avant', async () => {
    const world = attachmentWorld(async () => ({ encryptionMode: null, conversation: { encryptionMode: null } }));
    await world.run();
    expect(world.enqueue).toHaveBeenCalledWith('u-off', expect.anything());
  });
});

describe('une édition REST relaie sa déclaration jusqu’à la file', () => {
  it.each([true, false])('atRest %s arrive tel quel au relais du manager, puis au sceau', async (atRest) => {
    const relayed: OfflineParticipantQueueParams[] = [];
    const room = { emit: () => undefined };
    await broadcastMessageMutation({
      prisma: {
        participant: { findMany: async () => [] },
        message: { findFirst: async () => null },
      } as never,
      manager: {
        getIO: () => ({ to: () => room }),
        enqueueOfflineMessageMutation: async (params: OfflineParticipantQueueParams) => { relayed.push(params); },
        emitUnreadCountsToRecipients: async () => undefined,
      } as never,
      conversationId: CONV,
      actorUserId: 'u-editor',
      messageId: MSG,
      eventType: 'edited',
      payload: { id: MSG, conversationId: CONV, content: SECRET } as never,
      atRest,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(relayed[0]).toMatchObject({ eventType: 'edited', atRest });
    const offline = offlineDeps();
    await enqueueForOfflineParticipants(offline.deps, relayed[0] as OfflineParticipantQueueParams);
    expect(offline.enqueue.mock.calls[0]?.slice(2)).toEqual(atRest ? [{ sealAtRest: true }] : []);
  });
});
