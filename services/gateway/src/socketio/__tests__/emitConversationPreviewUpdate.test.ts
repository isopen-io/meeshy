import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';

type Emitted = { room: string; event: string; payload: any };

function makeIo(sink: Emitted[]) {
  return {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        sink.push({ room, event, payload });
      },
    }),
  };
}

function makePrisma(
  participants: Array<{ userId: string | null }>,
  latest: { id: string; content: string | null; senderId: string; createdAt: Date } | null,
) {
  return {
    participant: { findMany: jest.fn(async () => participants) },
    message: { findFirst: jest.fn(async () => latest) },
  } as any;
}

describe('emitConversationPreviewUpdate', () => {
  const latest = {
    id: 'msg-latest',
    content: 'the current last message',
    senderId: 'participant-A',
    createdAt: new Date('2026-07-09T10:00:00Z'),
  };

  it('fans conversation:updated to every active participant user room with the recomputed latest preview', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [{ userId: 'user-A' }, { userId: 'user-B' }, { userId: 'user-C' }],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted.map((e) => e.room).sort()).toEqual(['user:user-A', 'user:user-B', 'user:user-C']);
    for (const e of emitted) {
      expect(e.event).toBe(SERVER_EVENTS.CONVERSATION_UPDATED);
      expect(e.payload.conversationId).toBe('conv-1');
      expect(e.payload.lastMessageId).toBe('msg-latest');
      expect(e.payload.lastMessagePreview).toBe('the current last message');
      expect(e.payload.senderId).toBe('participant-A');
      // ConversationUpdatedEventData requires `updatedBy` — the User.id of whoever
      // triggered the edit/delete, NOT the (participant) senderId of the preview.
      expect(e.payload.updatedBy).toEqual({ id: 'user-editor' });
    }
    // Recompute must scope to non-deleted messages.
    expect((prisma.message.findFirst as jest.Mock).mock.calls[0][0]).toMatchObject({
      where: { conversationId: 'conv-1', deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('skips anonymous participants (no userId) and dedupes repeated userIds', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [{ userId: 'user-A' }, { userId: null }, { userId: 'user-A' }],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].room).toBe('user:user-A');
  });

  it('emits a null preview when the last message of the conversation was deleted', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ userId: 'user-A' }], null);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted).toHaveLength(1);
    expect(emitted[0].payload.lastMessageId).toBeNull();
    expect(emitted[0].payload.lastMessagePreview).toBeNull();
    // Deleting the last message still carries the actor so clients can attribute
    // the change even when there is no surviving message to fall back on.
    expect(emitted[0].payload.updatedBy).toEqual({ id: 'user-editor' });
  });

  it('is a no-op when the Socket.IO layer is unavailable', async () => {
    const prisma = makePrisma([{ userId: 'user-A' }], latest);
    await expect(emitConversationPreviewUpdate(prisma, null, 'conv-1', 'user-editor')).resolves.toBeUndefined();
    expect(prisma.participant.findMany).not.toHaveBeenCalled();
  });

  it('never throws and reports through onError when the query fails', async () => {
    const err = new Error('db down');
    const prisma = {
      participant: { findMany: jest.fn(async () => { throw err; }) },
      message: { findFirst: jest.fn(async () => latest) },
    } as any;
    const onError = jest.fn();

    await expect(
      emitConversationPreviewUpdate(prisma, makeIo([]), 'conv-1', 'user-editor', onError),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(err);
  });
});
