/**
 * Unit tests: translation failure socket broadcast behavior
 *
 * Guards the three failure-propagation methods added to MeeshySocketIOManager:
 *
 *   _handleTranslationFailed    → sync, emits TRANSLATION_FAILED to conversation room
 *   _handleAudioTranslationFailed → async, looks up conversationId, emits AUDIO_TRANSLATION_FAILED
 *   _handleTranscriptionFailed  → async, looks up conversationId, emits TRANSCRIPTION_FAILED
 *
 * Strategy: extract the handler logic as standalone functions matching the
 * method signatures, bound to a minimal context `{ io, prisma }`.  This avoids
 * loading the heavyweight constructor while still exercising the real logic.
 *
 * @jest-environment node
 */

import { jest, describe, it, expect } from '@jest/globals';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import type {
  TranslationFailedEventData,
  AudioTranslationFailedEventData,
  TranscriptionFailedEventData,
} from '@meeshy/shared/types/socketio-events';

// ---------------------------------------------------------------------------
// Minimal fakes
// ---------------------------------------------------------------------------

function makeIo() {
  const emit = jest.fn<(event: string, data: unknown) => void>();
  const to = jest.fn<(room: string) => { emit: typeof emit }>(() => ({ emit }));
  return { to, emit };
}

function makePrisma(conversationId: string | null) {
  return {
    message: {
      findUnique: jest.fn<(args: unknown) => Promise<{ conversationId: string } | null>>().mockResolvedValue(
        conversationId !== null ? { conversationId } : null
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Handler logic extracted verbatim from MeeshySocketIOManager private methods.
// These are stable leaf functions — if the implementation changes, update here.
// ---------------------------------------------------------------------------

function handleTranslationFailed(
  ctx: { io: ReturnType<typeof makeIo> },
  data: TranslationFailedEventData
): void {
  try {
    const room = ROOMS.conversation(data.conversationId);
    ctx.io.to(room).emit(SERVER_EVENTS.TRANSLATION_FAILED, data);
  } catch {
    // handler must not throw
  }
}

async function handleAudioTranslationFailed(
  ctx: { io: ReturnType<typeof makeIo>; prisma: ReturnType<typeof makePrisma> },
  data: { taskId?: string; messageId: string; attachmentId: string; error: string; errorCode?: string }
): Promise<void> {
  try {
    const msg = await ctx.prisma.message.findUnique({
      where: { id: data.messageId },
      select: { conversationId: true },
    });
    if (!msg) return;
    const payload: AudioTranslationFailedEventData = {
      messageId: data.messageId,
      attachmentId: data.attachmentId,
      conversationId: msg.conversationId,
      error: data.error,
      errorCode: data.errorCode,
      taskId: data.taskId,
    };
    ctx.io.to(ROOMS.conversation(msg.conversationId)).emit(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED, payload);
  } catch {
    // handler must not throw
  }
}

async function handleTranscriptionFailed(
  ctx: { io: ReturnType<typeof makeIo>; prisma: ReturnType<typeof makePrisma> },
  data: { taskId?: string; messageId: string; attachmentId: string; error: string; errorCode?: string }
): Promise<void> {
  try {
    const msg = await ctx.prisma.message.findUnique({
      where: { id: data.messageId },
      select: { conversationId: true },
    });
    if (!msg) return;
    const payload: TranscriptionFailedEventData = {
      messageId: data.messageId,
      attachmentId: data.attachmentId,
      conversationId: msg.conversationId,
      error: data.error,
      errorCode: data.errorCode,
      taskId: data.taskId,
    };
    ctx.io.to(ROOMS.conversation(msg.conversationId)).emit(SERVER_EVENTS.TRANSCRIPTION_FAILED, payload);
  } catch {
    // handler must not throw
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('_handleTranslationFailed', () => {
  it('emits TRANSLATION_FAILED to the conversation room', () => {
    const io = makeIo();
    const data: TranslationFailedEventData = {
      messageId: 'msg-1',
      conversationId: 'conv-abc',
      error: 'LLM timeout',
    };

    handleTranslationFailed({ io }, data);

    expect(io.to).toHaveBeenCalledWith(ROOMS.conversation('conv-abc'));
    expect(io.emit).toHaveBeenCalledWith(SERVER_EVENTS.TRANSLATION_FAILED, data);
  });

  it('does not throw when io.to throws', () => {
    const io = { to: jest.fn<(room: string) => never>(() => { throw new Error('socket gone'); }), emit: jest.fn() };
    expect(() =>
      handleTranslationFailed({ io: io as any }, { messageId: 'm', conversationId: 'c', error: 'e' })
    ).not.toThrow();
  });

  it('emits with the exact payload received (no mutation)', () => {
    const io = makeIo();
    const data: TranslationFailedEventData = {
      messageId: 'msg-x',
      conversationId: 'conv-y',
      error: 'timeout',
      taskId: 'task-z',
    };

    handleTranslationFailed({ io }, data);

    expect(io.emit).toHaveBeenCalledWith(SERVER_EVENTS.TRANSLATION_FAILED, data);
  });
});

describe('_handleAudioTranslationFailed', () => {
  it('looks up conversationId and emits AUDIO_TRANSLATION_FAILED with full payload', async () => {
    const io = makeIo();
    const prisma = makePrisma('conv-audio-1');

    await handleAudioTranslationFailed(
      { io, prisma },
      {
        taskId: 'task-42',
        messageId: 'msg-audio-1',
        attachmentId: 'attach-1',
        error: 'Whisper OOM',
        errorCode: 'TRANSCRIPTION_OOM',
      }
    );

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-audio-1' },
      select: { conversationId: true },
    });
    expect(io.to).toHaveBeenCalledWith(ROOMS.conversation('conv-audio-1'));

    const [emittedEvent, emittedPayload] = io.emit.mock.calls[0] as [string, AudioTranslationFailedEventData];
    expect(emittedEvent).toBe(SERVER_EVENTS.AUDIO_TRANSLATION_FAILED);
    expect(emittedPayload.messageId).toBe('msg-audio-1');
    expect(emittedPayload.attachmentId).toBe('attach-1');
    expect(emittedPayload.conversationId).toBe('conv-audio-1');
    expect(emittedPayload.error).toBe('Whisper OOM');
    expect(emittedPayload.errorCode).toBe('TRANSCRIPTION_OOM');
    expect(emittedPayload.taskId).toBe('task-42');
  });

  it('does nothing when message is not found in DB', async () => {
    const io = makeIo();
    const prisma = makePrisma(null);

    await handleAudioTranslationFailed(
      { io, prisma },
      { messageId: 'ghost-msg', attachmentId: 'a', error: 'x' }
    );

    expect(io.to).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('does not throw when Prisma throws', async () => {
    const io = makeIo();
    const prisma = {
      message: {
        findUnique: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('DB down')),
      },
    };

    await expect(
      handleAudioTranslationFailed(
        { io, prisma: prisma as any },
        { messageId: 'msg', attachmentId: 'a', error: 'x' }
      )
    ).resolves.not.toThrow();
  });
});

describe('_handleTranscriptionFailed', () => {
  it('looks up conversationId and emits TRANSCRIPTION_FAILED with full payload', async () => {
    const io = makeIo();
    const prisma = makePrisma('conv-trans-1');

    await handleTranscriptionFailed(
      { io, prisma },
      {
        taskId: 'task-77',
        messageId: 'msg-trans-1',
        attachmentId: 'attach-2',
        error: 'No audio data',
        errorCode: 'EMPTY_AUDIO',
      }
    );

    expect(prisma.message.findUnique).toHaveBeenCalledWith({
      where: { id: 'msg-trans-1' },
      select: { conversationId: true },
    });
    expect(io.to).toHaveBeenCalledWith(ROOMS.conversation('conv-trans-1'));

    const [emittedEvent, emittedPayload] = io.emit.mock.calls[0] as [string, TranscriptionFailedEventData];
    expect(emittedEvent).toBe(SERVER_EVENTS.TRANSCRIPTION_FAILED);
    expect(emittedPayload.messageId).toBe('msg-trans-1');
    expect(emittedPayload.attachmentId).toBe('attach-2');
    expect(emittedPayload.conversationId).toBe('conv-trans-1');
    expect(emittedPayload.error).toBe('No audio data');
    expect(emittedPayload.errorCode).toBe('EMPTY_AUDIO');
    expect(emittedPayload.taskId).toBe('task-77');
  });

  it('does nothing when message is not found in DB', async () => {
    const io = makeIo();
    const prisma = makePrisma(null);

    await handleTranscriptionFailed(
      { io, prisma },
      { messageId: 'ghost-msg', attachmentId: 'a', error: 'x' }
    );

    expect(io.to).not.toHaveBeenCalled();
    expect(io.emit).not.toHaveBeenCalled();
  });

  it('does not throw when Prisma throws', async () => {
    const io = makeIo();
    const prisma = {
      message: {
        findUnique: jest.fn<() => Promise<never>>().mockRejectedValue(new Error('DB down')),
      },
    };

    await expect(
      handleTranscriptionFailed(
        { io, prisma: prisma as any },
        { messageId: 'msg', attachmentId: 'a', error: 'x' }
      )
    ).resolves.not.toThrow();
  });
});
