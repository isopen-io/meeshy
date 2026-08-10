import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitConversationPreviewUpdate } from '../emitConversationPreviewUpdate';

type Emitted = { room: string; event: string; payload: any };

// Chainable double: `io.to(a).to(b).emit(e, p)` records one entry per room so
// every assertion below reads the rooms actually addressed, regardless of
// whether the emitter loops or chains.
function makeIo(sink: Emitted[]) {
  const chain = (rooms: readonly string[]) => ({
    to: (room: string) => chain([...rooms, room]),
    emit: (event: string, payload: unknown) => {
      for (const room of rooms) sink.push({ room, event, payload });
    },
  });
  return { to: (room: string) => chain([room]) };
}

function makePrisma(
  participants: Array<{ id?: string; userId: string | null }>,
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

  it('addresses an accountless participant by its participant id, and dedupes repeated userIds', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-anonymous', userId: null },
        { id: 'p-A-second-device-row', userId: 'user-A' },
      ],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    // A conversation opened through a share link is populated with anonymous
    // participants, and `AuthHandler` joins them to `user:<Participant.id>`.
    // Skipping them does not avoid a room that does not exist — their list row
    // simply never learns the preview changed.
    expect(emitted.map((e) => e.room)).toEqual(['user:user-A', 'user:p-anonymous']);
  });

  it('selects the participant id so the accountless fallback identity can be read at all', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect((prisma.participant.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      select: { id: true, userId: true },
    });
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

  it('Lot 3 : restitue `location` quand le dernier message est geolocalise (et un contenu vide n est pas fabrique)', async () => {
    const GEO = { latitude: 48.8566, longitude: 2.3522, name: 'Tour Eiffel', address: null, category: null };
    const emitted: Emitted[] = [];
    const geoLatest: any = { ...latest, content: '', metadata: { location: GEO } };
    const prisma = makePrisma([{ userId: 'user-A' }], geoLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    // Constat, pas une exigence : content vide reste vide, aucun texte de
    // repli fabriqué côté serveur — au client de décider du rendu.
    expect(emitted[0].payload.lastMessagePreview).toBe('');
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
