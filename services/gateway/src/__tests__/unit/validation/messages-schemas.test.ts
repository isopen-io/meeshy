import {
  MessageParamsSchema,
  AttachmentParamsSchema,
  MessageStatusDetailsQuerySchema,
  AttachmentStatusDetailsQuerySchema,
  UpdateMessageBodySchema,
  MessageStatusBodySchema,
  AttachmentStatusBodySchema,
} from '../../../validation/messages-schemas';

const VALID_OID = '507f1f77bcf86cd799439011';

describe('MessageParamsSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID }).success).toBe(true);
  });

  it('rejects a non-hex id', () => {
    expect(MessageParamsSchema.safeParse({ messageId: 'not-valid-objectid-1234' }).success).toBe(false);
  });

  it('rejects a 23-char id', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID.slice(1) }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageParamsSchema.safeParse({ messageId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('AttachmentParamsSchema', () => {
  it('accepts a valid 24-char hex ObjectId', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: VALID_OID }).success).toBe(true);
  });

  it('rejects an invalid ObjectId', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: 'bad-id' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(AttachmentParamsSchema.safeParse({ attachmentId: VALID_OID, extra: true }).success).toBe(false);
  });
});

describe('MessageStatusDetailsQuerySchema', () => {
  it('uses defaults when empty object given', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(20);
      expect(result.data.filter).toBe('all');
    }
  });

  it('parses valid string offset and limit', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ offset: '5', limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(5);
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects offset = -1', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });

  it('rejects limit = 0 (below min)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });

  it('rejects limit = 101 (above max)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('accepts limit = 100 (boundary)', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ limit: '100' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(100);
  });

  it('accepts filter = "delivered"', () => {
    const result = MessageStatusDetailsQuerySchema.safeParse({ filter: 'delivered' });
    expect(result.success).toBe(true);
  });

  it('accepts filter = "read"', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'read' }).success).toBe(true);
  });

  it('accepts filter = "unread"', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'unread' }).success).toBe(true);
  });

  it('rejects unknown filter value', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ filter: 'pending' }).success).toBe(false);
  });

  it('rejects non-numeric offset string', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ offset: 'abc' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageStatusDetailsQuerySchema.safeParse({ extra: true }).success).toBe(false);
  });
});

describe('AttachmentStatusDetailsQuerySchema', () => {
  it('uses defaults when empty object given', () => {
    const result = AttachmentStatusDetailsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.offset).toBe(0);
      expect(result.data.limit).toBe(20);
      expect(result.data.filter).toBe('all');
    }
  });

  it('accepts filter = "viewed"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'viewed' }).success).toBe(true);
  });

  it('accepts filter = "downloaded"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'downloaded' }).success).toBe(true);
  });

  it('accepts filter = "listened"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'listened' }).success).toBe(true);
  });

  it('accepts filter = "watched"', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'watched' }).success).toBe(true);
  });

  it('rejects unknown filter value', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ filter: 'read' }).success).toBe(false);
  });

  it('rejects limit above 100', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('rejects negative offset', () => {
    expect(AttachmentStatusDetailsQuerySchema.safeParse({ offset: '-1' }).success).toBe(false);
  });
});

describe('UpdateMessageBodySchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(UpdateMessageBodySchema.safeParse({}).success).toBe(true);
  });

  it('accepts content only', () => {
    expect(UpdateMessageBodySchema.safeParse({ content: 'Hello' }).success).toBe(true);
  });

  it('accepts isEdited only', () => {
    expect(UpdateMessageBodySchema.safeParse({ isEdited: true }).success).toBe(true);
  });

  it('accepts both content and isEdited', () => {
    expect(UpdateMessageBodySchema.safeParse({ content: 'Hi', isEdited: true }).success).toBe(true);
  });

  it('rejects extra unknown fields (strict)', () => {
    expect(UpdateMessageBodySchema.safeParse({ extra: 'value' }).success).toBe(false);
  });

  it('rejects non-boolean isEdited', () => {
    expect(UpdateMessageBodySchema.safeParse({ isEdited: 'yes' }).success).toBe(false);
  });
});

describe('MessageStatusBodySchema', () => {
  it('accepts status = "read"', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read' }).success).toBe(true);
  });

  it('accepts status = "delivered"', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'delivered' }).success).toBe(true);
  });

  it('accepts status with an ISO timestamp', () => {
    const result = MessageStatusBodySchema.safeParse({
      status: 'read',
      timestamp: '2024-01-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'pending' }).success).toBe(false);
  });

  it('rejects missing status', () => {
    expect(MessageStatusBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid timestamp format', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read', timestamp: 'not-a-date' }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(MessageStatusBodySchema.safeParse({ status: 'read', extra: true }).success).toBe(false);
  });
});

describe('AttachmentStatusBodySchema', () => {
  it('accepts action = "listened"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened' }).success).toBe(true);
  });

  it('accepts action = "watched"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'watched' }).success).toBe(true);
  });

  it('accepts action = "viewed"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'viewed' }).success).toBe(true);
  });

  it('accepts action = "downloaded"', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'downloaded' }).success).toBe(true);
  });

  it('accepts action with all optional fields', () => {
    const result = AttachmentStatusBodySchema.safeParse({
      action: 'listened',
      playPositionMs: 500,
      durationMs: 10000,
      complete: true,
      wasZoomed: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown action', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'played' }).success).toBe(false);
  });

  it('rejects missing action', () => {
    expect(AttachmentStatusBodySchema.safeParse({}).success).toBe(false);
  });

  it('rejects negative playPositionMs', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: -1 }).success).toBe(false);
  });

  it('accepts zero playPositionMs (boundary)', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: 0 }).success).toBe(true);
  });

  it('rejects non-integer playPositionMs', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', playPositionMs: 1.5 }).success).toBe(false);
  });

  it('rejects extra fields (strict)', () => {
    expect(AttachmentStatusBodySchema.safeParse({ action: 'listened', extra: true }).success).toBe(false);
  });
});
