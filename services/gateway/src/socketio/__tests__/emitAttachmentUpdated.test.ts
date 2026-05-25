import { describe, it, expect, jest } from '@jest/globals';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';
import { emitAttachmentUpdated } from '../emitAttachmentUpdated';

describe('emitAttachmentUpdated', () => {
  it('emits message:attachment-updated to the conversation room with the serialized attachment', () => {
    const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
    const fakeEmit = jest.fn((event: string, payload: unknown) => {
      emitted.push({ room: '__captured__', event, payload });
    });
    const fakeIo: any = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        },
      }),
    };

    const attachment = {
      id: 'att-1',
      messageId: 'msg-1',
      fileUrl: 'https://cdn/voice.m4a',
      mimeType: 'audio/m4a',
      fileSize: 100,
      createdAt: new Date(),
      transcription: { text: 'Hi' },
      translations: { en: { url: 'https://cdn/en.mp3' } },
    } as Record<string, unknown>;

    emitAttachmentUpdated(fakeIo, 'conv-1', 'msg-1', attachment);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].event).toBe(SERVER_EVENTS.MESSAGE_ATTACHMENT_UPDATED);
    expect(emitted[0].room).toBe('conversation:conv-1');
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
});
