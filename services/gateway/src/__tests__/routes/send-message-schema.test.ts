import { describe, it, expect } from '@jest/globals';
import { SendMessageBodySchema } from '../../routes/conversations/messages';
import { MESSAGE_LIMITS } from '../../config/message-limits';

const cid = 'cid_d6fc465d-03eb-4fb9-8ac0-3a5c4fdb5377';
const attachmentId = '6a0ad7f66e21a483b4443d0b';

describe('SendMessageBodySchema — content vs attachment validation', () => {
  it('accepts a media-only message: empty content with attachmentIds', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a media-only message with content omitted entirely', () => {
    const result = SendMessageBodySchema.safeParse({
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('accepts a forwarded message with empty content', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
      forwardedFromId: attachmentId,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a plain text message', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'hello',
      clientMessageId: cid,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a text message with attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'légende',
      clientMessageId: cid,
      attachmentIds: [attachmentId],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty message: no content and no attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '',
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content with no attachments', () => {
    const result = SendMessageBodySchema.safeParse({
      content: '   ',
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly the MAX_MESSAGE_LENGTH limit', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH),
      clientMessageId: cid,
    });
    expect(result.success).toBe(true);
  });

  it('rejects content exceeding MAX_MESSAGE_LENGTH (env-configured, not hardcoded)', () => {
    const result = SendMessageBodySchema.safeParse({
      content: 'x'.repeat(MESSAGE_LIMITS.MAX_MESSAGE_LENGTH + 1),
      clientMessageId: cid,
    });
    expect(result.success).toBe(false);
  });
});

describe('SendMessageBodySchema — clientMessageId is optional', () => {
  it('accepts a text message WITHOUT clientMessageId (non-sync clients, e.g. scripts)', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello' });
    expect(result.success).toBe(true);
  });

  it('accepts a media-only message WITHOUT clientMessageId', () => {
    const result = SendMessageBodySchema.safeParse({ attachmentIds: [attachmentId] });
    expect(result.success).toBe(true);
  });

  it('still accepts a valid clientMessageId when provided (sync clients)', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello', clientMessageId: cid });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed clientMessageId when one IS provided', () => {
    const result = SendMessageBodySchema.safeParse({ content: 'hello', clientMessageId: 'not-a-cid' });
    expect(result.success).toBe(false);
  });
});
