import {
  ConversationIdParamSchema,
  SetEncryptionModeBodySchema,
} from '../../../validation/conversation-encryption-schemas';

const VALID_ID = '507f1f77bcf86cd799439011';

describe('ConversationIdParamSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: VALID_ID }).success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });

  it('rejects a 23-char id (too short)', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: 'a'.repeat(23) }).success).toBe(false);
  });

  it('rejects a 25-char id (too long)', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: 'a'.repeat(25) }).success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: 'gggggggggggggggggggggggg' }).success).toBe(false);
  });

  it('rejects missing conversationId field', () => {
    expect(ConversationIdParamSchema.safeParse({}).success).toBe(false);
  });
});

describe('SetEncryptionModeBodySchema', () => {
  it('accepts mode "e2ee"', () => {
    expect(SetEncryptionModeBodySchema.safeParse({ mode: 'e2ee' }).success).toBe(true);
  });

  it('accepts mode "server"', () => {
    expect(SetEncryptionModeBodySchema.safeParse({ mode: 'server' }).success).toBe(true);
  });

  it('accepts mode "hybrid"', () => {
    expect(SetEncryptionModeBodySchema.safeParse({ mode: 'hybrid' }).success).toBe(true);
  });

  it('rejects an unknown mode', () => {
    expect(SetEncryptionModeBodySchema.safeParse({ mode: 'none' }).success).toBe(false);
  });

  it('rejects empty string mode', () => {
    expect(SetEncryptionModeBodySchema.safeParse({ mode: '' }).success).toBe(false);
  });

  it('rejects missing mode field', () => {
    expect(SetEncryptionModeBodySchema.safeParse({}).success).toBe(false);
  });
});
