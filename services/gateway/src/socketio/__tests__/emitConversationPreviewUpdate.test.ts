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
      [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-B', userId: 'user-B' },
        { id: 'p-C', userId: 'user-C' },
      ],
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

  // Ce test affirmait l'inverse : « skips anonymous participants (no userId) ».
  // C'était le défaut, pas l'intention. Un participant sans compte a bien une
  // room personnelle — `AuthHandler` la nomme d'après son `Participant.id` — et
  // c'est par elle seule qu'il reçoit quoi que ce soit une fois sorti de la vue
  // conversation. Le sauter laissait un invité de lien partagé avec une ligne
  // de liste figée sur le texte d'avant l'édition, indéfiniment.
  it('addresses an accountless participant by its participant id, and dedupes repeated userIds', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma(
      [
        { id: 'p-A', userId: 'user-A' },
        { id: 'p-anon', userId: null },
        { id: 'p-A2', userId: 'user-A' },
      ],
      latest,
    );

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted.map((e) => e.room)).toEqual(['user:user-A', 'user:p-anon']);
  });

  it('selects the participant id, without which the fallback identity cannot be read', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect((prisma.participant.findMany as jest.Mock).mock.calls[0][0]).toMatchObject({
      select: { id: true, userId: true },
    });
  });

  it('emits a null preview when the last message of the conversation was deleted', async () => {
    const emitted: Emitted[] = [];
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], null);

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
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], geoLatest);

    await emitConversationPreviewUpdate(prisma, makeIo(emitted), 'conv-1', 'user-editor');

    expect(emitted[0].payload.location).toMatchObject({ latitude: 48.8566, name: 'Tour Eiffel' });
    // Constat, pas une exigence : content vide reste vide, aucun texte de
    // repli fabriqué côté serveur — au client de décider du rendu.
    expect(emitted[0].payload.lastMessagePreview).toBe('');
  });

  it('is a no-op when the Socket.IO layer is unavailable', async () => {
    const prisma = makePrisma([{ id: 'p-A', userId: 'user-A' }], latest);
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
