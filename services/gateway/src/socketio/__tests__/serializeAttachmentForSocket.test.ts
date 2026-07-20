import { describe, it, expect } from '@jest/globals';
import { serializeAttachmentForSocket, aggregateAttachmentReactions } from '../serializeAttachmentForSocket';

describe('serializeAttachmentForSocket', () => {
  it('preserves transcription and translations on audio attachment', () => {
    const attachment = {
      id: 'att-1',
      messageId: 'msg-1',
      fileName: 'voice.m4a',
      originalName: 'voice.m4a',
      mimeType: 'audio/m4a',
      fileSize: 870_400,
      fileUrl: 'https://cdn.meeshy.me/uploads/voice.m4a',
      thumbnailUrl: null,
      thumbHash: null,
      width: null,
      height: null,
      duration: 42_000,
      bitrate: 128_000,
      sampleRate: 44_100,
      codec: 'aac',
      channels: 2,
      fps: null,
      videoCodec: null,
      pageCount: null,
      lineCount: null,
      metadata: null,
      uploadedBy: 'user-1',
      isAnonymous: false,
      createdAt: new Date('2026-05-25T10:00:00Z'),
      transcription: { text: 'Bonjour', language: 'fr', confidence: 0.95 },
      translations: {
        en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
      },
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.id).toBe('att-1');
    expect(result.fileSize).toBe(870_400);
    expect(result.transcription).toEqual({ text: 'Bonjour', language: 'fr', confidence: 0.95 });
    expect(result.translations).toEqual({
      en: { url: 'https://cdn.meeshy.me/tts/en/voice.mp3', transcription: 'Hello', format: 'mp3' },
    });
    expect(result.duration).toBe(42_000);
    expect(result.codec).toBe('aac');
  });

  it('passes through null transcription and translations without throwing', () => {
    const attachment = {
      id: 'att-2',
      messageId: 'msg-2',
      fileName: 'pic.jpg',
      mimeType: 'image/jpeg',
      fileSize: 12_000,
      fileUrl: 'https://cdn.meeshy.me/uploads/pic.jpg',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);
    expect(result.transcription).toBeNull();
    expect(result.translations).toBeNull();
    expect(result.id).toBe('att-2');
  });

  it('defaults missing fileSize to 0 (defensive)', () => {
    const attachment = {
      id: 'att-3',
      messageId: 'msg-3',
      fileName: 'unknown.bin',
      mimeType: 'application/octet-stream',
      fileUrl: 'https://cdn.meeshy.me/uploads/unknown.bin',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);
    expect(result.fileSize).toBe(0);
  });

  it('aggregates reactions into reactionSummary and currentUserReactions', () => {
    const attachment = {
      id: 'att-4',
      messageId: 'msg-4',
      mimeType: 'image/png',
      fileSize: 5000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
      reactions: [
        { emoji: '❤️', participantId: 'user-A' },
        { emoji: '❤️', participantId: 'user-B' },
        { emoji: '👍', participantId: 'user-A' },
      ],
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>, 'user-A');

    expect(result.reactionSummary).toEqual({ '❤️': 2, '👍': 1 });
    expect(result.currentUserReactions).toEqual(['❤️', '👍']);
  });

  it('returns empty reactions when no reactions provided', () => {
    const attachment = {
      id: 'att-5',
      messageId: 'msg-5',
      mimeType: 'image/png',
      fileSize: 1000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img2.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('currentUserReactions is empty when currentParticipantId not provided', () => {
    const attachment = {
      id: 'att-6',
      messageId: 'msg-6',
      mimeType: 'image/png',
      fileSize: 1000,
      fileUrl: 'https://cdn.meeshy.me/uploads/img3.png',
      transcription: null,
      translations: null,
      createdAt: new Date(),
      reactions: [
        { emoji: '😊', participantId: 'user-X' },
      ],
    };

    const result = serializeAttachmentForSocket(attachment as Record<string, unknown>);

    expect(result.reactionSummary).toEqual({ '😊': 1 });
    expect(result.currentUserReactions).toEqual([]);
  });
});

describe('aggregateAttachmentReactions', () => {
  it('returns empty results for null rows', () => {
    const result = aggregateAttachmentReactions(null);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty results for undefined rows', () => {
    const result = aggregateAttachmentReactions(undefined);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('counts multiple reactions of the same emoji', () => {
    const rows = [
      { emoji: '❤️', participantId: 'u1' },
      { emoji: '❤️', participantId: 'u2' },
      { emoji: '❤️', participantId: 'u3' },
    ];
    const result = aggregateAttachmentReactions(rows);
    expect(result.reactionSummary['❤️']).toBe(3);
  });

  it('does not duplicate an emoji in currentUserReactions if user reacted twice (defensive)', () => {
    const rows = [
      { emoji: '❤️', participantId: 'u1' },
      { emoji: '❤️', participantId: 'u1' },
    ];
    const result = aggregateAttachmentReactions(rows, 'u1');
    expect(result.currentUserReactions).toEqual(['❤️']);
    expect(result.reactionSummary['❤️']).toBe(2);
  });

  it('does not add to currentUserReactions when participant does not match', () => {
    const rows = [{ emoji: '👍', participantId: 'other-user' }];
    const result = aggregateAttachmentReactions(rows, 'u1');
    expect(result.currentUserReactions).toEqual([]);
    expect(result.reactionSummary['👍']).toBe(1);
  });
});
