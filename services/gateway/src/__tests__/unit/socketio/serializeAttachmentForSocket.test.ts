/**
 * Unit tests for socketio/serializeAttachmentForSocket.
 * Covers: aggregateAttachmentReactions (null rows, empty, counts, dedup,
 * currentUserReactions), serializeAttachmentForSocket (required fields,
 * optional null defaults, transcription/translations pass-through).
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  aggregateAttachmentReactions,
  serializeAttachmentForSocket,
} from '../../../socketio/serializeAttachmentForSocket';

// ─── aggregateAttachmentReactions ─────────────────────────────────────────────

describe('aggregateAttachmentReactions', () => {
  it('returns empty maps for null rows', () => {
    const result = aggregateAttachmentReactions(null);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty maps for undefined rows', () => {
    const result = aggregateAttachmentReactions(undefined);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('returns empty maps for an empty array', () => {
    const result = aggregateAttachmentReactions([]);
    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('counts each emoji correctly', () => {
    const rows = [
      { emoji: '👍', participantId: 'p-1' },
      { emoji: '👍', participantId: 'p-2' },
      { emoji: '❤️', participantId: 'p-1' },
    ];
    const { reactionSummary } = aggregateAttachmentReactions(rows);
    expect(reactionSummary['👍']).toBe(2);
    expect(reactionSummary['❤️']).toBe(1);
  });

  it('includes emojis placed by the current participant in currentUserReactions', () => {
    const rows = [
      { emoji: '👍', participantId: 'p-me' },
      { emoji: '❤️', participantId: 'p-other' },
      { emoji: '🔥', participantId: 'p-me' },
    ];
    const { currentUserReactions } = aggregateAttachmentReactions(rows, 'p-me');
    expect(currentUserReactions).toContain('👍');
    expect(currentUserReactions).toContain('🔥');
    expect(currentUserReactions).not.toContain('❤️');
  });

  it('deduplicates currentUserReactions when the participant reacted with the same emoji twice', () => {
    const rows = [
      { emoji: '👍', participantId: 'p-me' },
      { emoji: '👍', participantId: 'p-me' },
    ];
    const { currentUserReactions } = aggregateAttachmentReactions(rows, 'p-me');
    expect(currentUserReactions.filter(e => e === '👍').length).toBe(1);
  });

  it('returns empty currentUserReactions when no currentParticipantId is given', () => {
    const rows = [{ emoji: '👍', participantId: 'p-1' }];
    const { currentUserReactions } = aggregateAttachmentReactions(rows);
    expect(currentUserReactions).toEqual([]);
  });
});

// ─── serializeAttachmentForSocket ─────────────────────────────────────────────

function makeRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'att-1',
    messageId: 'msg-1',
    mimeType: 'image/jpeg',
    fileSize: 12345,
    fileUrl: 'https://cdn.example.com/att-1.jpg',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    transcription: null,
    translations: null,
    ...overrides,
  };
}

describe('serializeAttachmentForSocket', () => {
  it('maps required fields correctly', () => {
    const raw = makeRaw();
    const result = serializeAttachmentForSocket(raw);

    expect(result.id).toBe('att-1');
    expect(result.messageId).toBe('msg-1');
    expect(result.mimeType).toBe('image/jpeg');
    expect(result.fileSize).toBe(12345);
    expect(result.fileUrl).toBe('https://cdn.example.com/att-1.jpg');
  });

  it('defaults missing optional fields to null', () => {
    const result = serializeAttachmentForSocket(makeRaw());

    expect(result.fileName).toBeNull();
    expect(result.originalName).toBeNull();
    expect(result.thumbnailUrl).toBeNull();
    expect(result.thumbHash).toBeNull();
    expect(result.width).toBeNull();
    expect(result.height).toBeNull();
    expect(result.duration).toBeNull();
    expect(result.bitrate).toBeNull();
    expect(result.sampleRate).toBeNull();
    expect(result.codec).toBeNull();
    expect(result.channels).toBeNull();
    expect(result.fps).toBeNull();
    expect(result.videoCodec).toBeNull();
    expect(result.pageCount).toBeNull();
    expect(result.lineCount).toBeNull();
    expect(result.metadata).toBeNull();
    expect(result.uploadedBy).toBeNull();
    expect(result.isAnonymous).toBeNull();
    expect(result.imageVariants).toBeNull();
  });

  it('passes through transcription and translations unchanged', () => {
    const transcription = { text: 'hello', language: 'en' };
    const translations = [{ language: 'fr', text: 'bonjour' }];
    const result = serializeAttachmentForSocket(makeRaw({ transcription, translations }));

    expect(result.transcription).toBe(transcription);
    expect(result.translations).toBe(translations);
  });

  it('includes aggregated reactions in the output', () => {
    const raw = makeRaw({
      reactions: [
        { emoji: '👍', participantId: 'p-1' },
        { emoji: '👍', participantId: 'p-2' },
        { emoji: '❤️', participantId: 'p-me' },
      ],
    });
    const result = serializeAttachmentForSocket(raw, 'p-me');

    expect(result.reactionSummary['👍']).toBe(2);
    expect(result.reactionSummary['❤️']).toBe(1);
    expect(result.currentUserReactions).toContain('❤️');
    expect(result.currentUserReactions).not.toContain('👍');
  });

  it('returns empty reactionSummary and currentUserReactions when reactions is absent', () => {
    const result = serializeAttachmentForSocket(makeRaw());

    expect(result.reactionSummary).toEqual({});
    expect(result.currentUserReactions).toEqual([]);
  });

  it('defaults fileSize to 0 when missing', () => {
    const raw = makeRaw({ fileSize: undefined });
    const result = serializeAttachmentForSocket(raw);
    expect(result.fileSize).toBe(0);
  });

  it('maps optional string fields when present', () => {
    const raw = makeRaw({
      fileName: 'photo.jpg',
      originalName: 'original.jpg',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      thumbHash: 'AQID',
      uploadedBy: 'u-1',
      codec: 'h264',
      videoCodec: 'avc1',
    });
    const result = serializeAttachmentForSocket(raw);

    expect(result.fileName).toBe('photo.jpg');
    expect(result.originalName).toBe('original.jpg');
    expect(result.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(result.thumbHash).toBe('AQID');
    expect(result.uploadedBy).toBe('u-1');
    expect(result.codec).toBe('h264');
    expect(result.videoCodec).toBe('avc1');
  });
});
