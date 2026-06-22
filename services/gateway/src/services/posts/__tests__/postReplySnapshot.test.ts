import { describe, it, expect } from '@jest/globals';
import {
  buildPostReplyTo,
  normalizePostReplyTo,
  postReplyToFromMetadata,
  POST_REPLY_SNAPSHOT_SELECT,
  type PostReplySnapshotablePost,
} from '../postReplySnapshot';

const makePost = (overrides: Partial<PostReplySnapshotablePost> = {}): PostReplySnapshotablePost => ({
  id: 'post-abc123',
  type: 'STORY',
  content: 'Hello World',
  moodEmoji: null,
  reactionCount: 5,
  commentCount: 3,
  shareCount: 2,
  createdAt: new Date('2026-01-01T12:00:00Z'),
  media: [],
  ...overrides,
});

describe('buildPostReplyTo', () => {
  it('maps all fields from a post to snapshot', () => {
    const post = makePost({ media: [{ thumbnailUrl: 'https://cdn.example.com/thumb.jpg' }] });
    const result = buildPostReplyTo(post);
    expect(result.id).toBe('post-abc123');
    expect(result.type).toBe('STORY');
    expect(result.moodEmoji).toBeNull();
    expect(result.previewText).toBe('Hello World');
    expect(result.thumbnailUrl).toBe('https://cdn.example.com/thumb.jpg');
    expect(result.reactionCount).toBe(5);
    expect(result.commentCount).toBe(3);
    expect(result.shareCount).toBe(2);
    expect(result.createdAt).toBe('2026-01-01T12:00:00.000Z');
  });

  it('returns empty previewText when content is null', () => {
    const result = buildPostReplyTo(makePost({ content: null }));
    expect(result.previewText).toBe('');
  });

  it('truncates previewText at 80 characters', () => {
    const longContent = 'A'.repeat(100);
    const result = buildPostReplyTo(makePost({ content: longContent }));
    expect(result.previewText).toHaveLength(80);
    expect(result.previewText).toBe('A'.repeat(80));
  });

  it('exactly 80 characters passes through unchanged', () => {
    const exactly80 = 'B'.repeat(80);
    const result = buildPostReplyTo(makePost({ content: exactly80 }));
    expect(result.previewText).toHaveLength(80);
  });

  it('trims leading/trailing whitespace before truncating', () => {
    const result = buildPostReplyTo(makePost({ content: '  hello  ' }));
    expect(result.previewText).toBe('hello');
  });

  it('returns null thumbnailUrl when media array is empty', () => {
    const result = buildPostReplyTo(makePost({ media: [] }));
    expect(result.thumbnailUrl).toBeNull();
  });

  it('returns null thumbnailUrl when first media item has null thumbnail', () => {
    const result = buildPostReplyTo(makePost({ media: [{ thumbnailUrl: null }] }));
    expect(result.thumbnailUrl).toBeNull();
  });

  it('returns null moodEmoji from post (preserved)', () => {
    const result = buildPostReplyTo(makePost({ moodEmoji: null }));
    expect(result.moodEmoji).toBeNull();
  });

  it('returns moodEmoji when present', () => {
    const result = buildPostReplyTo(makePost({ moodEmoji: '😊' }));
    expect(result.moodEmoji).toBe('😊');
  });

  it('uses 0 as fallback for null counts', () => {
    const result = buildPostReplyTo(makePost({ reactionCount: null, commentCount: null, shareCount: null }));
    expect(result.reactionCount).toBe(0);
    expect(result.commentCount).toBe(0);
    expect(result.shareCount).toBe(0);
  });

  it('uses actual counts when provided', () => {
    const result = buildPostReplyTo(makePost({ reactionCount: 42, commentCount: 7, shareCount: 15 }));
    expect(result.reactionCount).toBe(42);
    expect(result.commentCount).toBe(7);
    expect(result.shareCount).toBe(15);
  });

  it('serializes createdAt as ISO string', () => {
    const date = new Date('2025-06-15T10:30:00Z');
    const result = buildPostReplyTo(makePost({ createdAt: date }));
    expect(result.createdAt).toBe('2025-06-15T10:30:00.000Z');
  });
});

describe('normalizePostReplyTo', () => {
  it('returns null for null input', () => {
    expect(normalizePostReplyTo(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(normalizePostReplyTo(undefined)).toBeNull();
  });

  it('returns null for non-object (string)', () => {
    expect(normalizePostReplyTo('some string')).toBeNull();
  });

  it('returns null for non-object (number)', () => {
    expect(normalizePostReplyTo(42)).toBeNull();
  });

  it('returns null when id is missing', () => {
    expect(normalizePostReplyTo({ type: 'POST' })).toBeNull();
  });

  it('returns null when id is not a string', () => {
    expect(normalizePostReplyTo({ id: 123, type: 'POST' })).toBeNull();
  });

  it('normalizes a valid snapshot object', () => {
    const raw = {
      id: 'snap-001',
      type: 'REEL',
      moodEmoji: '🎵',
      previewText: 'Check this out',
      thumbnailUrl: 'https://cdn.example.com/thumb.jpg',
      reactionCount: 10,
      commentCount: 2,
      shareCount: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const result = normalizePostReplyTo(raw);
    expect(result).toEqual(raw);
  });

  it('falls back to POST type when type is missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.type).toBe('POST');
  });

  it('falls back to null moodEmoji when missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.moodEmoji).toBeNull();
  });

  it('falls back to empty string previewText when missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.previewText).toBe('');
  });

  it('falls back to null thumbnailUrl when missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.thumbnailUrl).toBeNull();
  });

  it('falls back to 0 counts when missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.reactionCount).toBe(0);
    expect(result?.commentCount).toBe(0);
    expect(result?.shareCount).toBe(0);
  });

  it('falls back to epoch ISO string when createdAt is missing', () => {
    const result = normalizePostReplyTo({ id: 'post-1' });
    expect(result?.createdAt).toBe(new Date(0).toISOString());
  });

  it('uses provided createdAt string verbatim', () => {
    const result = normalizePostReplyTo({ id: 'post-1', createdAt: '2024-05-01T00:00:00.000Z' });
    expect(result?.createdAt).toBe('2024-05-01T00:00:00.000Z');
  });
});

describe('postReplyToFromMetadata', () => {
  it('returns null for null input', () => {
    expect(postReplyToFromMetadata(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(postReplyToFromMetadata(undefined)).toBeNull();
  });

  it('returns null for non-object (string)', () => {
    expect(postReplyToFromMetadata('invalid')).toBeNull();
  });

  it('returns null when postReplyTo key is missing', () => {
    expect(postReplyToFromMetadata({ someOtherField: true })).toBeNull();
  });

  it('returns null when postReplyTo is null', () => {
    expect(postReplyToFromMetadata({ postReplyTo: null })).toBeNull();
  });

  it('returns null when postReplyTo has no id', () => {
    expect(postReplyToFromMetadata({ postReplyTo: { type: 'POST' } })).toBeNull();
  });

  it('normalizes a valid postReplyTo from metadata', () => {
    const metadata = {
      postReplyTo: {
        id: 'post-xyz',
        type: 'STATUS',
        moodEmoji: '😀',
        previewText: 'Hello',
        thumbnailUrl: null,
        reactionCount: 3,
        commentCount: 1,
        shareCount: 0,
        createdAt: '2026-03-01T00:00:00.000Z',
      },
    };
    const result = postReplyToFromMetadata(metadata);
    expect(result?.id).toBe('post-xyz');
    expect(result?.type).toBe('STATUS');
    expect(result?.moodEmoji).toBe('😀');
  });
});

describe('POST_REPLY_SNAPSHOT_SELECT', () => {
  it('is frozen (immutable)', () => {
    expect(Object.isFrozen(POST_REPLY_SNAPSHOT_SELECT)).toBe(true);
  });

  it('selects the required fields for building a snapshot', () => {
    expect(POST_REPLY_SNAPSHOT_SELECT).toMatchObject({
      id: true,
      type: true,
      content: true,
      moodEmoji: true,
      reactionCount: true,
      commentCount: true,
      shareCount: true,
      createdAt: true,
    });
  });

  it('includes media selection with thumbnailUrl', () => {
    expect(POST_REPLY_SNAPSHOT_SELECT.media).toEqual(
      expect.objectContaining({ select: expect.objectContaining({ thumbnailUrl: true }) }),
    );
  });
});
