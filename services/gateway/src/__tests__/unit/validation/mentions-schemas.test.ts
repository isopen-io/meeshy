/**
 * Unit tests for mentions-schemas.ts
 *
 * Focus: MyMentionsQuerySchema.limit MUST carry the same numeric-format guard
 * and 1..100 range clamp as every sibling paginated query schema
 * (GetNotificationsQuerySchema, MessageStatusDetailsQuerySchema, …). A missing
 * clamp let `limit=-5` survive `limit || 50` truthy and reach Prisma as
 * `take: -5`, which — under `orderBy: { mentionedAt: 'desc' }` — returns the
 * OLDEST mentions reversed instead of the most recent, silently breaking the
 * "recent mentions" endpoint; and `limit=100000` bypassed the shared cap.
 */

import { describe, it, expect } from '@jest/globals';
import {
  MyMentionsQuerySchema,
  SuggestionsQuerySchema,
  MessageIdParamSchema,
} from '../../../validation/mentions-schemas';

const VALID_OID = 'aabbccddeeff001122334455';

// ─── MyMentionsQuerySchema ───────────────────────────────────────────────────

describe('MyMentionsQuerySchema', () => {
  it('defaults limit to 20 when omitted', () => {
    const result = MyMentionsQuerySchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('parses a numeric-string limit and transforms it to a number', () => {
    const result = MyMentionsQuerySchema.parse({ limit: '50' });
    expect(result.limit).toBe(50);
  });

  it('accepts the lower bound 1', () => {
    expect(MyMentionsQuerySchema.parse({ limit: '1' }).limit).toBe(1);
  });

  it('accepts the upper bound 100', () => {
    expect(MyMentionsQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });

  it('rejects a non-numeric limit instead of yielding NaN', () => {
    expect(() => MyMentionsQuerySchema.parse({ limit: 'abc' })).toThrow();
  });

  it('rejects a negative limit (would reverse Prisma take semantics)', () => {
    // `/^\d+$/` is what closes the real defect: a negative never matches, so it
    // can never reach Prisma as a `take: -5` that returns the OLDEST rows reversed.
    expect(() => MyMentionsQuerySchema.parse({ limit: '-5' })).toThrow();
  });

  it('accepts 0 — this endpoint treats it as "unspecified" via its own || 50 fallback', () => {
    // Deliberately admitted (lower bound >= 0, not >= 1 like the twin schemas):
    // routes/mentions.ts does `limit || 50`, a contract frozen by
    // mentions-routes.test.ts. The schema returns 0; the route maps it to 50.
    expect(MyMentionsQuerySchema.parse({ limit: '0' }).limit).toBe(0);
  });

  it('rejects limit > 100 (shared pagination cap)', () => {
    expect(() => MyMentionsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects an unbounded limit', () => {
    expect(() => MyMentionsQuerySchema.parse({ limit: '100000' })).toThrow();
  });

  it('rejects unknown keys (strict)', () => {
    expect(() => MyMentionsQuerySchema.parse({ limit: '20', extra: '1' })).toThrow();
  });
});

// ─── SuggestionsQuerySchema (regression guard on the sibling in this file) ────

describe('SuggestionsQuerySchema', () => {
  it('accepts contextId + contextType', () => {
    const result = SuggestionsQuerySchema.parse({ contextId: VALID_OID, contextType: 'post' });
    expect(result.contextType).toBe('post');
  });

  it('accepts the legacy conversationId alone', () => {
    const result = SuggestionsQuerySchema.parse({ conversationId: VALID_OID });
    expect(result.conversationId).toBe(VALID_OID);
  });

  it('rejects when neither context pair nor conversationId is given', () => {
    expect(() => SuggestionsQuerySchema.parse({ query: 'foo' })).toThrow();
  });
});

// ─── MessageIdParamSchema ─────────────────────────────────────────────────────

describe('MessageIdParamSchema', () => {
  it('accepts a valid ObjectId', () => {
    expect(MessageIdParamSchema.parse({ messageId: VALID_OID }).messageId).toBe(VALID_OID);
  });

  it('rejects a malformed ObjectId', () => {
    expect(() => MessageIdParamSchema.parse({ messageId: 'not-an-id' })).toThrow();
  });
});
