import {
  MessageIdParamSchema,
  ConversationIdParamSchema,
  ReadStatusesQuerySchema,
  DeliveryReceiptParamsSchema,
} from '../../../validation/message-read-status-schemas';

const VALID_OID = '507f1f77bcf86cd799439011';
const INVALID_OID = 'not-an-objectid';

describe('MessageIdParamSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(MessageIdParamSchema.safeParse({ messageId: VALID_OID }).success).toBe(true);
  });

  it('rejects a 23-char id', () => {
    expect(MessageIdParamSchema.safeParse({ messageId: VALID_OID.slice(1) }).success).toBe(false);
  });

  it('rejects non-hex characters', () => {
    expect(MessageIdParamSchema.safeParse({ messageId: 'gggggggggggggggggggggggg' }).success).toBe(false);
  });

  it('rejects missing messageId field', () => {
    expect(MessageIdParamSchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageIdParamSchema.safeParse({ messageId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('ConversationIdParamSchema', () => {
  it('accepts a non-empty conversationId', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: 'some-conv-id' }).success).toBe(true);
  });

  it('accepts a MongoDB ObjectId as conversationId', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: VALID_OID }).success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: '' }).success).toBe(false);
  });

  it('rejects missing conversationId field', () => {
    expect(ConversationIdParamSchema.safeParse({}).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(ConversationIdParamSchema.safeParse({ conversationId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('ReadStatusesQuerySchema', () => {
  it('accepts empty object (messageIds is optional)', () => {
    expect(ReadStatusesQuerySchema.safeParse({}).success).toBe(true);
  });

  it('accepts a single valid ObjectId in messageIds', () => {
    expect(ReadStatusesQuerySchema.safeParse({ messageIds: VALID_OID }).success).toBe(true);
  });

  it('accepts a comma-separated list of valid ObjectIds', () => {
    const ids = `${VALID_OID},${VALID_OID}`;
    expect(ReadStatusesQuerySchema.safeParse({ messageIds: ids }).success).toBe(true);
  });

  it('rejects messageIds containing an invalid ObjectId', () => {
    expect(ReadStatusesQuerySchema.safeParse({ messageIds: `${VALID_OID},invalid` }).success).toBe(false);
  });

  it('rejects messageIds that is a single invalid id', () => {
    expect(ReadStatusesQuerySchema.safeParse({ messageIds: INVALID_OID }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(ReadStatusesQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe('DeliveryReceiptParamsSchema', () => {
  it('accepts valid conversationId and messageId', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({
      conversationId: 'conv-abc',
      messageId: VALID_OID,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty conversationId', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({ conversationId: '', messageId: VALID_OID });
    expect(result.success).toBe(false);
  });

  it('rejects invalid messageId format', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({ conversationId: 'conv-abc', messageId: INVALID_OID });
    expect(result.success).toBe(false);
  });

  it('rejects missing conversationId', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({ messageId: VALID_OID });
    expect(result.success).toBe(false);
  });

  it('rejects missing messageId', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({ conversationId: 'conv-abc' });
    expect(result.success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    const result = DeliveryReceiptParamsSchema.safeParse({
      conversationId: 'conv-abc',
      messageId: VALID_OID,
      extra: true,
    });
    expect(result.success).toBe(false);
  });
});
