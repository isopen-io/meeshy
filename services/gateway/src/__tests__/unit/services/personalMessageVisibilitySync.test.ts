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
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MSG_A = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const MSG_B = 'cccccccccccccccccccccccc';

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
      },
    },
  } as never;
};

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

    expect(emissions).toHaveLength(1);
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

    expect(emissions).toHaveLength(1);
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

    expect(emissions).toHaveLength(1);
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

    expect(emissions).toHaveLength(1);
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
