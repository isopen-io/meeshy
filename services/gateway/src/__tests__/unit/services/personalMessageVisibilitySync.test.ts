/**
 * `personalMessageVisibilitySync` — the single writer of `UserMessageDeletion`.
 *
 * The row is per-USER, not per-device, so every write owes three things that
 * only work as a set: persist it, retract the notification that still holds a
 * copy of the excerpt, and BROADCAST to `user:{id}` so the user's other devices
 * converge. The three routes that wrote the table each honoured the first two
 * and none of the third, which made "delete for me" a per-device illusion.
 *
 * These tests pin the whole contract rather than the persistence alone: a write
 * that lands without its broadcast is exactly the bug this module exists to
 * make unwriteable.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const retractMock = jest.fn<(...args: unknown[]) => Promise<number>>(async () => 0);
jest.mock('../../../services/messaging/retractHiddenMessageNotifications', () => ({
  retractNotificationsForHiddenMessages: (...args: unknown[]) => retractMock(...args),
}));

import {
  hideMessagesForUser,
  restoreMessageForUser,
} from '../../../services/personalMessageVisibilitySync';

const USER_ID = '507f1f77bcf86cd799439011';
const PEER_ID = '507f1f77bcf86cd799439012';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_CONV_ID = 'dddddddddddddddddddddddd';
const MSG_A = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const MSG_B = 'cccccccccccccccccccccccc';
const LATEST_ID = MSG_A;
const PREVIOUS_ID = 'eeeeeeeeeeeeeeeeeeeeeeee';

type Emission = { room: string; event: string; payload: unknown };

const makeFastify = (emissions: Emission[], opts: { io?: boolean } = {}) => {
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        emissions.push({ room, event, payload });
      },
    }),
  };
  return {
    log: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
    ...(opts.io === false ? {} : { socketIOHandler: { io } }),
    prisma: {
      userMessageDeletion: {
        upsert: jest.fn(async (_args: unknown) => ({ id: 'x' })),
        delete: jest.fn(async (_args: unknown) => ({ id: 'x' })),
        // Sert la sonde de masquage de `emitConversationPreviewUpdate` : le
        // masquage qui vient d'être écrit porte sur le dernier message, donc le
        // lecteur reçoit son propre remplaçant.
        findMany: jest.fn(async () => [{ userId: USER_ID, messageId: LATEST_ID }]),
      },
      // Les trois modèles que le rafraîchissement de la ligne de liste lit. Sans
      // eux le double serait MUET sur la moitié du contrat : l'émetteur d'aperçu
      // est un canal best-effort qui avale ses propres pannes, si bien qu'un
      // double incomplet rend le test vert sur une version qui n'appelle rien.
      participant: {
        findMany: jest.fn(async () => [
          { id: 'part-me', userId: USER_ID },
          { id: 'part-peer', userId: PEER_ID },
        ]),
      },
      message: {
        findFirst: jest.fn(async (q: any) => {
          const isFallback = q?.where?.id !== undefined || q?.where?.createdAt !== undefined;
          return isFallback
            ? { id: PREVIOUS_ID, content: 'the one before', senderId: 'part-peer', createdAt: new Date('2026-08-15T09:00:00Z') }
            : { id: LATEST_ID, content: 'the hidden one', senderId: 'part-peer', createdAt: new Date('2026-08-15T10:00:00Z') };
        }),
      },
      userConversationPreferences: { findMany: jest.fn(async () => []) },
    },
  } as never;
};

const hiddenEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME);
const previewEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);

describe('hideMessagesForUser', () => {
  beforeEach(() => {
    retractMock.mockClear();
  });

  it('persists one row per message, retracts the notifications and broadcasts once', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, {
      userId: USER_ID,
      messages: [
        { messageId: MSG_A, conversationId: CONV_ID },
        { messageId: MSG_B, conversationId: CONV_ID },
      ],
    });

    const prisma = (fastify as unknown as { prisma: { userMessageDeletion: { upsert: jest.Mock } } })
      .prisma;
    expect(prisma.userMessageDeletion.upsert).toHaveBeenCalledTimes(2);
    expect(retractMock).toHaveBeenCalledTimes(1);
    expect(retractMock.mock.calls[0]?.[1]).toEqual({
      userId: USER_ID,
      messageIds: [MSG_A, MSG_B],
    });

    expect(hiddenEmissions(emissions)).toHaveLength(1);
    expect(emissions[0]?.room).toBe(`user:${USER_ID}`);
    expect(emissions[0]?.event).toBe(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME);
    const payload = emissions[0]?.payload as {
      userId: string;
      messages: Array<{ messageId: string; conversationId: string }>;
      hiddenAt: string;
    };
    expect(payload.userId).toBe(USER_ID);
    expect(payload.messages).toEqual([
      { messageId: MSG_A, conversationId: CONV_ID },
      { messageId: MSG_B, conversationId: CONV_ID },
    ]);
    expect(Number.isNaN(new Date(payload.hiddenAt).getTime())).toBe(false);
  });

  it('emits ONE event for a bulk hide rather than one per message', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, {
      userId: USER_ID,
      messages: Array.from({ length: 40 }, (_, i) => ({
        messageId: `${i}`.padStart(24, '0'),
        conversationId: CONV_ID,
      })),
    });

    expect(hiddenEmissions(emissions)).toHaveLength(1);
    expect((emissions[0]?.payload as { messages: unknown[] }).messages).toHaveLength(40);
  });

  it('writes and broadcasts nothing when the caller names no message', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, { userId: USER_ID, messages: [] });

    const prisma = (fastify as unknown as { prisma: { userMessageDeletion: { upsert: jest.Mock } } })
      .prisma;
    expect(prisma.userMessageDeletion.upsert).not.toHaveBeenCalled();
    expect(retractMock).not.toHaveBeenCalled();
    expect(emissions).toHaveLength(0);
  });

  it('still broadcasts when the notification retraction throws', async () => {
    retractMock.mockRejectedValueOnce(new Error('notification store down'));
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await expect(
      hideMessagesForUser(fastify, {
        userId: USER_ID,
        messages: [{ messageId: MSG_A, conversationId: CONV_ID }],
      })
    ).resolves.toBeUndefined();

    expect(hiddenEmissions(emissions)).toHaveLength(1);
    expect(emissions[0]?.event).toBe(SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME);
  });

  it('resolves without throwing when the Socket.IO layer is unavailable', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions, { io: false });

    await expect(
      hideMessagesForUser(fastify, {
        userId: USER_ID,
        messages: [{ messageId: MSG_A, conversationId: CONV_ID }],
      })
    ).resolves.toBeUndefined();

    const prisma = (fastify as unknown as { prisma: { userMessageDeletion: { upsert: jest.Mock } } })
      .prisma;
    expect(prisma.userMessageDeletion.upsert).toHaveBeenCalledTimes(1);
    expect(emissions).toHaveLength(0);
  });
});

describe('restoreMessageForUser', () => {
  it('deletes the row and broadcasts the inverse event', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await restoreMessageForUser(fastify, {
      userId: USER_ID,
      message: { messageId: MSG_A, conversationId: CONV_ID },
    });

    const prisma = (fastify as unknown as { prisma: { userMessageDeletion: { delete: jest.Mock } } })
      .prisma;
    expect(prisma.userMessageDeletion.delete).toHaveBeenCalledWith({
      where: { userId_messageId: { userId: USER_ID, messageId: MSG_A } },
    });

    expect(emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME)).toHaveLength(1);
    expect(emissions[0]?.room).toBe(`user:${USER_ID}`);
    expect(emissions[0]?.event).toBe(SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME);
    const payload = emissions[0]?.payload as {
      messages: Array<{ messageId: string; conversationId: string }>;
      restoredAt: string;
    };
    expect(payload.messages).toEqual([{ messageId: MSG_A, conversationId: CONV_ID }]);
    expect(Number.isNaN(new Date(payload.restoredAt).getTime())).toBe(false);
  });

  it('does not broadcast a restore whose delete failed', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);
    const prisma = (fastify as unknown as { prisma: { userMessageDeletion: { delete: jest.Mock } } })
      .prisma;
    prisma.userMessageDeletion.delete.mockRejectedValueOnce(new Error('row vanished'));

    await expect(
      restoreMessageForUser(fastify, {
        userId: USER_ID,
        message: { messageId: MSG_A, conversationId: CONV_ID },
      })
    ).rejects.toThrow('row vanished');

    expect(emissions).toHaveLength(0);
  });
});

/**
 * La QUATRIÈME chose que tout masquage personnel doit : rafraîchir la LIGNE DE
 * LISTE de celui qui masque.
 *
 * `message:hidden-for-me` retire la bulle du fil. Il ne dit rien de la ligne de
 * liste, qui porte son propre aperçu — et cet aperçu est servi par le serveur
 * avec le masquage personnel appliqué (`resolveVisibleLastMessages` côté REST,
 * `resolvePersonalPreviewOverrides` côté temps réel). Masquer le dernier message
 * laissait donc la ligne afficher exactement ce qu'on venait d'en retirer,
 * jusqu'à ce qu'une mutation SANS RAPPORT (une édition d'un tiers, une
 * traduction qui atterrit) fasse repasser l'émetteur d'aperçu.
 *
 * Autrement dit la règle avait trois consommateurs et aucun déclencheur propre :
 * elle corrigeait la ligne de tout le monde SAUF au moment où le masquage naît.
 */
describe('le masquage personnel rafraîchit la ligne de liste de son auteur', () => {
  beforeEach(() => {
    retractMock.mockClear();
  });

  it('pousse conversation:updated avec le remplaçant, dans la seule room de l auteur', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, {
      userId: USER_ID,
      messages: [{ messageId: MSG_A, conversationId: CONV_ID }],
    });

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(1);
    expect(previews[0]?.room).toBe(`user:${USER_ID}`);
    const payload = previews[0]?.payload as {
      conversationId: string;
      lastMessageId: string | null;
      lastMessagePreview: string | null;
    };
    expect(payload.conversationId).toBe(CONV_ID);
    expect(payload.lastMessageId).toBe(PREVIOUS_ID);
    expect(payload.lastMessagePreview).toBe('the one before');
  });

  it('n envoie RIEN aux pairs : leur ligne n a pas changé d un octet', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, {
      userId: USER_ID,
      messages: [{ messageId: MSG_A, conversationId: CONV_ID }],
    });

    expect(previewEmissions(emissions).map((e) => e.room)).toEqual([`user:${USER_ID}`]);
  });

  it('un lot qui traverse deux conversations rafraîchit UNE ligne par conversation', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, {
      userId: USER_ID,
      messages: [
        { messageId: MSG_A, conversationId: CONV_ID },
        { messageId: MSG_B, conversationId: CONV_ID },
        { messageId: PREVIOUS_ID, conversationId: OTHER_CONV_ID },
      ],
    });

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(2);
    expect(
      previews.map((e) => (e.payload as { conversationId: string }).conversationId).sort()
    ).toEqual([CONV_ID, OTHER_CONV_ID].sort());
  });

  it('la restauration rafraîchit la ligne au même titre que le masquage', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await restoreMessageForUser(fastify, {
      userId: USER_ID,
      message: { messageId: MSG_A, conversationId: CONV_ID },
    });

    const previews = previewEmissions(emissions);
    expect(previews).toHaveLength(1);
    expect(previews[0]?.room).toBe(`user:${USER_ID}`);
  });

  it('une ligne qu on ne sait pas recalculer ne fait PAS échouer le masquage', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);
    const prisma = (fastify as unknown as { prisma: { participant: { findMany: jest.Mock } } }).prisma;
    prisma.participant.findMany.mockRejectedValueOnce(new Error('db down'));

    await expect(
      hideMessagesForUser(fastify, {
        userId: USER_ID,
        messages: [{ messageId: MSG_A, conversationId: CONV_ID }],
      })
    ).resolves.toBeUndefined();

    expect(hiddenEmissions(emissions)).toHaveLength(1);
    expect(previewEmissions(emissions)).toHaveLength(0);
  });

  it('aucun masquage, aucun rafraîchissement', async () => {
    const emissions: Emission[] = [];
    const fastify = makeFastify(emissions);

    await hideMessagesForUser(fastify, { userId: USER_ID, messages: [] });

    expect(previewEmissions(emissions)).toHaveLength(0);
  });
});
