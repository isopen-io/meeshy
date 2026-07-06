/**
 * Unit tests for posts route types and schemas (types.ts)
 * Tests encodeCursor, decodeCursor, CreatePostSchema, UpdatePostSchema,
 * StoryEffectsSchema, CreateCommentSchema.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  encodeCursor,
  decodeCursor,
  CreatePostSchema,
  UpdatePostSchema,
  StoryEffectsSchema,
  CreateCommentSchema,
} from '../../../../routes/posts/types';

// ─── encodeCursor ─────────────────────────────────────────────────────────────

describe('encodeCursor', () => {
  it('encodes a Date and id into a base64url string', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const result = encodeCursor(date, 'abc123');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('encodes a string date and id into a base64url string', () => {
    const result = encodeCursor('2024-01-01T00:00:00.000Z', 'abc123');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('produces output that decodeCursor can round-trip', () => {
    const date = new Date('2024-06-15T12:00:00.000Z');
    const id = '507f1f77bcf86cd799439011';
    const encoded = encodeCursor(date, id);
    const decoded = decodeCursor(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.id).toBe(id);
    expect(decoded?.createdAt).toBe(date.toISOString());
  });

  it('encodes different dates to different cursors', () => {
    const c1 = encodeCursor(new Date('2024-01-01'), 'id-1');
    const c2 = encodeCursor(new Date('2024-06-01'), 'id-2');
    expect(c1).not.toBe(c2);
  });
});

// ─── decodeCursor ─────────────────────────────────────────────────────────────

describe('decodeCursor', () => {
  it('returns null for invalid base64url input (garbage bytes)', () => {
    const result = decodeCursor('this is not valid base64url!!!');
    expect(result).toBeNull();
  });

  it('returns null for valid base64url that decodes to missing id field', () => {
    const missingId = Buffer.from(JSON.stringify({ createdAt: '2024-01-01' })).toString('base64url');
    const result = decodeCursor(missingId);
    expect(result).toBeNull();
  });

  it('returns null for valid base64url that decodes to missing createdAt field', () => {
    const missingDate = Buffer.from(JSON.stringify({ id: 'abc' })).toString('base64url');
    const result = decodeCursor(missingDate);
    expect(result).toBeNull();
  });

  it('returns null for empty string', () => {
    const result = decodeCursor('');
    expect(result).toBeNull();
  });

  it('returns null for base64url of empty JSON object', () => {
    const emptyObj = Buffer.from(JSON.stringify({})).toString('base64url');
    const result = decodeCursor(emptyObj);
    expect(result).toBeNull();
  });

  it('returns the decoded data when cursor is valid', () => {
    const cursor = encodeCursor('2024-03-20T08:00:00.000Z', 'test-id-123');
    const result = decodeCursor(cursor);
    expect(result).toEqual({ createdAt: '2024-03-20T08:00:00.000Z', id: 'test-id-123' });
  });
});

// ─── CreatePostSchema ─────────────────────────────────────────────────────────

describe('CreatePostSchema', () => {
  it('parses a valid POST payload', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', content: 'Hello world', visibility: 'PUBLIC' });
    expect(result.success).toBe(true);
  });

  it('rejects EXCEPT visibility without visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'EXCEPT' });
    expect(result.success).toBe(false);
  });

  it('accepts EXCEPT visibility with non-empty visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      visibility: 'EXCEPT',
      visibilityUserIds: ['user-001'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects ONLY visibility without visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'ONLY' });
    expect(result.success).toBe(false);
  });

  it('accepts ONLY visibility with non-empty visibilityUserIds', () => {
    const result = CreatePostSchema.safeParse({
      type: 'POST',
      visibility: 'ONLY',
      visibilityUserIds: ['user-001'],
    });
    expect(result.success).toBe(true);
  });

  it('defaults type to POST when not specified', () => {
    const result = CreatePostSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.type).toBe('POST');
  });

  it('accepts STORY type', () => {
    const result = CreatePostSchema.safeParse({ type: 'STORY', content: 'My story' });
    expect(result.success).toBe(true);
  });

  it('accepts STATUS type', () => {
    const result = CreatePostSchema.safeParse({ type: 'STATUS' });
    expect(result.success).toBe(true);
  });

  it('accepts EXCEPT visibility with empty visibilityUserIds array (fails refine)', () => {
    const result = CreatePostSchema.safeParse({ type: 'POST', visibility: 'EXCEPT', visibilityUserIds: [] });
    expect(result.success).toBe(false);
  });
});

// ─── UpdatePostSchema ─────────────────────────────────────────────────────────

describe('UpdatePostSchema', () => {
  it('parses a valid update payload with content', () => {
    const result = UpdatePostSchema.safeParse({ content: 'Updated content' });
    expect(result.success).toBe(true);
  });

  it('rejects EXCEPT visibility without visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'EXCEPT' });
    expect(result.success).toBe(false);
  });

  it('rejects ONLY visibility without visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'ONLY' });
    expect(result.success).toBe(false);
  });

  it('accepts empty update (all fields optional)', () => {
    const result = UpdatePostSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts EXCEPT visibility with non-empty visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'EXCEPT', visibilityUserIds: ['user-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts ONLY visibility with non-empty visibilityUserIds', () => {
    const result = UpdatePostSchema.safeParse({ visibility: 'ONLY', visibilityUserIds: ['user-1'] });
    expect(result.success).toBe(true);
  });

  it('accepts type change to REEL', () => {
    const result = UpdatePostSchema.safeParse({ type: 'REEL' });
    expect(result.success).toBe(true);
  });
});

// ─── StoryEffectsSchema ───────────────────────────────────────────────────────

describe('StoryEffectsSchema', () => {
  it('parses valid story effects with known fields', () => {
    const result = StoryEffectsSchema.safeParse({
      background: '#ff0000',
      thumbHash: 'abc123',
      slideDuration: 5,
    });
    expect(result.success).toBe(true);
  });

  it('rejects story effects exceeding 256KB total JSON size', () => {
    const bigString = 'a'.repeat(256 * 1024 + 1);
    const result = StoryEffectsSchema.safeParse({ background: bigString });
    expect(result.success).toBe(false);
  });

  it('rejects mediaObjects array exceeding 32 entries', () => {
    const mediaObjects = Array.from({ length: 33 }, (_, i) => ({ id: `media-${i}` }));
    const result = StoryEffectsSchema.safeParse({ mediaObjects });
    expect(result.success).toBe(false);
  });

  it('accepts mediaObjects array at max cap (32 entries)', () => {
    const mediaObjects = Array.from({ length: 32 }, (_, i) => ({ id: `media-${i}` }));
    const result = StoryEffectsSchema.safeParse({ mediaObjects });
    expect(result.success).toBe(true);
  });

  it('parses empty story effects object', () => {
    const result = StoryEffectsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('passes through unknown fields (passthrough policy)', () => {
    const result = StoryEffectsSchema.safeParse({ unknownField: 'value', background: '#000' });
    expect(result.success).toBe(true);
  });
});

// ─── CreateCommentSchema ──────────────────────────────────────────────────────

describe('CreateCommentSchema', () => {
  it('parses a valid comment with text content', () => {
    const result = CreateCommentSchema.safeParse({ content: 'Hello world' });
    expect(result.success).toBe(true);
  });

  it('parses a valid comment with attachment only (no text)', () => {
    const result = CreateCommentSchema.safeParse({ attachmentIds: ['media-001'] });
    expect(result.success).toBe(true);
  });

  it('rejects a comment with neither content nor attachment', () => {
    const result = CreateCommentSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a comment with empty content and no attachment', () => {
    const result = CreateCommentSchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('accepts a comment with both content and attachment', () => {
    const result = CreateCommentSchema.safeParse({ content: 'Great!', attachmentIds: ['media-001'] });
    expect(result.success).toBe(true);
  });

  it('rejects attachmentIds with more than 1 entry', () => {
    const result = CreateCommentSchema.safeParse({ attachmentIds: ['media-001', 'media-002'] });
    expect(result.success).toBe(false);
  });
});
