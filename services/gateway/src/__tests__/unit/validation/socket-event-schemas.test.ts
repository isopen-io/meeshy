/**
 * Unit tests for socket-event-schemas.ts
 * Verifies that Zod schemas enforce size limits before business logic runs,
 * preventing DoS and oversized payload attacks at the boundary.
 */

import {
  SocketMessageSendSchema,
  SocketMessageSendWithAttachmentsSchema,
  SocketMessageEditSchema,
  SocketConversationJoinSchema,
  SocketConversationLeaveSchema,
  SocketReactionAddSchema,
} from '../../../validation/socket-event-schemas.js';

const VALID_MONGO_ID = '507f1f77bcf86cd799439011';
const VALID_CLIENT_ID = 'cid_550e8400-e29b-41d4-a716-446655440000';

describe('SocketMessageSendSchema', () => {
  const base = {
    conversationId: VALID_MONGO_ID,
    content: 'Hello',
    clientMessageId: VALID_CLIENT_ID,
  };

  it('accepts a valid minimal message', () => {
    expect(SocketMessageSendSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, conversationId: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a conversationId exceeding 255 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, conversationId: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, content: 'x'.repeat(100_001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 100 000 chars', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, content: 'x'.repeat(100_000) });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid clientMessageId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, clientMessageId: 'bad-id' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid replyToId', () => {
    const result = SocketMessageSendSchema.safeParse({ ...base, replyToId: 'not-an-objectid' });
    expect(result.success).toBe(false);
  });
});

describe('SocketMessageSendWithAttachmentsSchema', () => {
  const base = {
    conversationId: VALID_MONGO_ID,
    content: '',
    attachmentIds: [VALID_MONGO_ID],
    clientMessageId: VALID_CLIENT_ID,
  };

  it('accepts a valid payload', () => {
    expect(SocketMessageSendWithAttachmentsSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty attachmentIds array', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 100 attachment IDs', () => {
    const ids = Array.from({ length: 101 }, () => VALID_MONGO_ID);
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: ids });
    expect(result.success).toBe(false);
  });

  it('accepts exactly 100 attachment IDs', () => {
    const ids = Array.from({ length: 100 }, () => VALID_MONGO_ID);
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({ ...base, attachmentIds: ids });
    expect(result.success).toBe(true);
  });

  it('rejects attachment IDs that are not valid MongoDB ObjectIds', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      ...base,
      attachmentIds: ['not-an-objectid'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageSendWithAttachmentsSchema.safeParse({
      ...base,
      content: 'x'.repeat(100_001),
    });
    expect(result.success).toBe(false);
  });
});

describe('SocketMessageEditSchema', () => {
  const base = {
    messageId: VALID_MONGO_ID,
    content: 'Edited content',
  };

  it('accepts a valid edit', () => {
    expect(SocketMessageEditSchema.safeParse(base).success).toBe(true);
  });

  // Regression: the handler allows clearing a caption on an attachment message
  // (MessageHandler.handleMessageEdit gates emptiness on hasAttachments). A
  // `.min(1)` here would reject the empty string at the boundary and make that
  // branch unreachable, silently killing caption removal over the socket path.
  it('accepts empty content (caption removal on attachment messages)', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: '' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid messageId', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, messageId: 'not-an-objectid' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 100 000 chars', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: 'x'.repeat(100_001) });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 100 000 chars', () => {
    const result = SocketMessageEditSchema.safeParse({ ...base, content: 'x'.repeat(100_000) });
    expect(result.success).toBe(true);
  });
});

describe('SocketConversationJoinSchema', () => {
  it('accepts a valid conversationId', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: VALID_MONGO_ID }).success).toBe(true);
  });

  it('accepts a short identifier like "meeshy"', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: 'meeshy' }).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });

  it('rejects a conversationId exceeding 255 chars', () => {
    expect(SocketConversationJoinSchema.safeParse({ conversationId: 'a'.repeat(256) }).success).toBe(false);
  });
});

describe('SocketConversationLeaveSchema', () => {
  it('accepts a valid conversationId', () => {
    expect(SocketConversationLeaveSchema.safeParse({ conversationId: VALID_MONGO_ID }).success).toBe(true);
  });

  it('rejects an empty conversationId', () => {
    expect(SocketConversationLeaveSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });
});

describe('SocketReactionAddSchema', () => {
  it('accepts a valid emoji up to 10 chars', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '👍' });
    expect(result.success).toBe(true);
  });

  it('rejects an emoji exceeding 10 chars', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '😀'.repeat(11) });
    expect(result.success).toBe(false);
  });

  it('rejects an empty emoji', () => {
    const result = SocketReactionAddSchema.safeParse({ messageId: VALID_MONGO_ID, emoji: '' });
    expect(result.success).toBe(false);
  });
});
