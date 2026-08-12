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
  overrides: Partial<{ findMany: any; enqueue: any }> = {},
) {
  const emitted: Emitted[] = [];
  const enqueued: Enqueued[] = [];

  // Mirrors Socket.IO's BroadcastOperator: `to()` accumulates rooms and the
  // final `emit()` delivers ONCE per socket across the whole chain.
  const makeOperator = (rooms: string[]) => ({
    to: (room: string) => makeOperator([...rooms, room]),
    emit: (event: string, payload: unknown) => {
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
      prisma: { participant: { findMany } } as any,
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

  it('still emits to the conversation room when the participant lookup fails', async () => {
    const { emitted, deps } = makeDeps(THREE, [], {
      findMany: jest.fn(async () => {
        throw new Error('mongo down');
      }),
    });

    await emitAttachmentUpdated({ ...deps, conversationId: 'conv-1', messageId: 'msg-1', attachment: ATTACHMENT });

    // Degrading to the previous audience beats emitting nothing: the readers
    // sitting IN the conversation are the ones watching the media right now.
    expect(emitted).toHaveLength(1);
    expect(emitted[0].rooms).toEqual(['conversation:conv-1']);
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

    expect(findMany).toHaveBeenCalledTimes(1);
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
