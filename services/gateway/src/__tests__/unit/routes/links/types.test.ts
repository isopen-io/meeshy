/**
 * routes/links/types unit tests — Zod schema validation
 *
 * @jest-environment node
 */

import {
  createLinkSchema,
  updateLinkSchema,
  sendMessageSchema,
} from '../../../../routes/links/types';

// ---------------------------------------------------------------------------
// createLinkSchema
// ---------------------------------------------------------------------------

describe('createLinkSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(createLinkSchema.safeParse({}).success).toBe(true);
  });

  it('accepts valid minimal config with conversationId', () => {
    const result = createLinkSchema.safeParse({ conversationId: 'conv_abc' });
    expect(result.success).toBe(true);
  });

  it('accepts all boolean flags', () => {
    const result = createLinkSchema.safeParse({
      allowAnonymousMessages: true,
      allowAnonymousFiles: false,
      allowAnonymousImages: true,
      allowViewHistory: false,
      requireAccount: false,
      requireNickname: true,
      requireEmail: false,
      requireBirthday: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts numeric limit fields as positive integers', () => {
    const result = createLinkSchema.safeParse({
      maxUses: 100,
      maxConcurrentUsers: 10,
      maxUniqueSessions: 50,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxUses that is not positive', () => {
    expect(createLinkSchema.safeParse({ maxUses: 0 }).success).toBe(false);
    expect(createLinkSchema.safeParse({ maxUses: -1 }).success).toBe(false);
  });

  it('rejects maxUses that is not an integer', () => {
    expect(createLinkSchema.safeParse({ maxUses: 1.5 }).success).toBe(false);
  });

  it('accepts allowedCountries, allowedLanguages, allowedIpRanges as string arrays', () => {
    const result = createLinkSchema.safeParse({
      allowedCountries: ['FR', 'US'],
      allowedLanguages: ['fr', 'en'],
      allowedIpRanges: ['192.168.1.0/24'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid expiresAt ISO datetime', () => {
    const result = createLinkSchema.safeParse({ expiresAt: '2027-01-01T00:00:00Z' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid expiresAt', () => {
    expect(createLinkSchema.safeParse({ expiresAt: 'not-a-date' }).success).toBe(false);
  });

  it('accepts newConversation with valid title', () => {
    const result = createLinkSchema.safeParse({
      newConversation: { title: 'New Chat', description: 'A conversation', memberIds: ['u1'] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects newConversation with empty title', () => {
    expect(
      createLinkSchema.safeParse({ newConversation: { title: '' } }).success
    ).toBe(false);
  });

  it('accepts newConversation with only title', () => {
    const result = createLinkSchema.safeParse({ newConversation: { title: 'Chat' } });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// updateLinkSchema
// ---------------------------------------------------------------------------

describe('updateLinkSchema', () => {
  it('accepts empty object', () => {
    expect(updateLinkSchema.safeParse({}).success).toBe(true);
  });

  it('accepts isActive boolean', () => {
    expect(updateLinkSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it('accepts null for maxUses to unset limit', () => {
    const result = updateLinkSchema.safeParse({ maxUses: null });
    expect(result.success).toBe(true);
  });

  it('accepts null for expiresAt to remove expiry', () => {
    const result = updateLinkSchema.safeParse({ expiresAt: null });
    expect(result.success).toBe(true);
  });

  it('rejects maxConcurrentUsers that is not positive', () => {
    expect(updateLinkSchema.safeParse({ maxConcurrentUsers: 0 }).success).toBe(false);
  });

  it('accepts all optional string fields', () => {
    const result = updateLinkSchema.safeParse({ name: 'New name', description: 'Updated' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sendMessageSchema
// ---------------------------------------------------------------------------

describe('sendMessageSchema', () => {
  function makeValidMessage(overrides: Record<string, unknown> = {}) {
    return {
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello',
      ...overrides,
    };
  }

  it('accepts valid message with content', () => {
    expect(sendMessageSchema.safeParse(makeValidMessage()).success).toBe(true);
  });

  it('defaults originalLanguage to fr', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.originalLanguage).toBe('fr');
  });

  it('defaults messageType to text', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.messageType).toBe('text');
  });

  it('accepts custom originalLanguage', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage({ originalLanguage: 'en' }));
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.originalLanguage).toBe('en');
  });

  it('rejects missing clientMessageId', () => {
    expect(sendMessageSchema.safeParse({ content: 'Hi' }).success).toBe(false);
  });

  it('rejects invalid clientMessageId format', () => {
    expect(
      sendMessageSchema.safeParse({ ...makeValidMessage(), clientMessageId: 'bad-id' }).success
    ).toBe(false);
  });

  it('rejects clientMessageId with uppercase UUID', () => {
    // Must be lowercase
    expect(
      sendMessageSchema.safeParse({
        ...makeValidMessage(),
        clientMessageId: 'cid_550E8400-E29B-41D4-A716-446655440000',
      }).success
    ).toBe(false);
  });

  it('rejects content exceeding 1000 chars', () => {
    expect(
      sendMessageSchema.safeParse(makeValidMessage({ content: 'a'.repeat(1001) })).success
    ).toBe(false);
  });

  it('requires either content or attachments (refine)', () => {
    // No content, no attachments
    expect(
      sendMessageSchema.safeParse({
        clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      }).success
    ).toBe(false);
  });

  it('accepts attachments without content', () => {
    const result = sendMessageSchema.safeParse({
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      attachments: ['attachment-id-1'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts content as whitespace-only (refine allows empty-ish when attachments present)', () => {
    // whitespace-only content with no attachments should fail refine
    const result = sendMessageSchema.safeParse({
      clientMessageId: 'cid_550e8400-e29b-41d4-a716-446655440000',
      content: '   ',
    });
    // trim() returns empty, so refine returns false
    expect(result.success).toBe(false);
  });

  it('accepts attachments as empty array when content is provided', () => {
    const result = sendMessageSchema.safeParse(makeValidMessage({ attachments: [] }));
    // content is present, but attachments.length === 0 — refine checks content || attachments.length > 0
    // content is 'Hello' so this passes
    expect(result.success).toBe(true);
  });
});
