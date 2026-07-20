/**
 * message-formatters unit tests
 *
 * @jest-environment node
 */

import {
  formatMessageWithUnifiedSender,
  formatMessageWithSeparateSenders,
} from '../../../../routes/links/utils/message-formatters';

function makeUserSender(overrides: Record<string, unknown> = {}) {
  return {
    type: 'user',
    user: {
      id: 'user_001',
      username: 'alice',
      firstName: 'Alice',
      lastName: 'Dupont',
      displayName: 'Alice Dupont',
      avatar: 'https://cdn.meeshy.me/avatars/alice.jpg',
      systemLanguage: 'fr',
    },
    ...overrides,
  };
}

function makeAnonSender(overrides: Record<string, unknown> = {}) {
  return {
    type: 'anonymous',
    id: 'anon_session_abc',
    displayName: 'Guest User',
    avatar: null,
    language: 'en',
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_001',
    content: 'Hello world',
    originalLanguage: 'en',
    createdAt: new Date('2026-01-01T12:00:00Z'),
    status: [],
    sender: makeUserSender(),
    translations: {},
    messageType: 'text',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    replyToId: null,
    updatedAt: new Date('2026-01-01T12:00:00Z'),
    statusEntries: [],
    attachments: [],
    reactions: [],
    replyTo: null,
    ...overrides,
  };
}

describe('formatMessageWithUnifiedSender', () => {
  it('returns message id, content, originalLanguage, createdAt', () => {
    const result = formatMessageWithUnifiedSender(makeMessage());
    expect(result.id).toBe('msg_001');
    expect(result.content).toBe('Hello world');
    expect(result.originalLanguage).toBe('en');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('extracts sender info from user type sender', () => {
    const result = formatMessageWithUnifiedSender(makeMessage());
    expect(result.sender.id).toBe('user_001');
    expect(result.sender.username).toBe('alice');
    expect(result.sender.isMeeshyer).toBe(true);
  });

  it('returns isMeeshyer=false for anonymous sender', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ sender: makeAnonSender() }));
    expect(result.sender.isMeeshyer).toBe(false);
    expect(result.sender.id).toBe('anon_session_abc');
    expect(result.sender.username).toBe('Guest User');
  });

  it('returns unknown sender when sender is null', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ sender: null }));
    expect(result.sender.id).toBe('unknown');
    expect(result.sender.username).toBe('unknown');
    expect(result.sender.isMeeshyer).toBe(false);
  });

  it('falls back to fr when originalLanguage is missing', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ originalLanguage: undefined }));
    expect(result.originalLanguage).toBe('fr');
  });

  it('returns translations as array (delegates to transformTranslationsToArray)', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ translations: {} }));
    expect(Array.isArray(result.translations)).toBe(true);
  });

  it('passes status to result', () => {
    const result = formatMessageWithUnifiedSender(makeMessage({ status: [{ userId: 'u1', status: 'read' }] }));
    expect(result.status).toHaveLength(1);
  });
});

describe('formatMessageWithSeparateSenders', () => {
  it('populates sender for registered user, null anonymousSender', () => {
    const result = formatMessageWithSeparateSenders(makeMessage());
    expect(result.sender).not.toBeNull();
    expect(result.sender!.id).toBe('user_001');
    expect(result.anonymousSender).toBeNull();
  });

  it('populates anonymousSender for anonymous sender, null sender', () => {
    const result = formatMessageWithSeparateSenders(makeMessage({ sender: makeAnonSender() }));
    expect(result.anonymousSender).not.toBeNull();
    expect(result.anonymousSender!.id).toBe('anon_session_abc');
    expect(result.anonymousSender!.username).toBe('Guest User');
    expect(result.sender).toBeNull();
  });

  it('returns all top-level fields', () => {
    const result = formatMessageWithSeparateSenders(makeMessage());
    expect(result.id).toBe('msg_001');
    expect(result.content).toBe('Hello world');
    expect(result.messageType).toBe('text');
    expect(result.isEdited).toBe(false);
    expect(result.attachments).toEqual([]);
    expect(result.reactions).toEqual([]);
    expect(Array.isArray(result.translations)).toBe(true);
  });

  it('includes replyTo when provided', () => {
    const replyTo = {
      id: 'msg_000',
      content: 'Original',
      originalLanguage: 'fr',
      messageType: 'text',
      createdAt: new Date(),
      sender: makeUserSender(),
    };
    const result = formatMessageWithSeparateSenders(makeMessage({ replyTo }));
    expect(result.replyTo).not.toBeNull();
    expect(result.replyTo!.id).toBe('msg_000');
    expect(result.replyTo!.sender!.id).toBe('user_001');
    expect(result.replyTo!.anonymousSender).toBeNull();
  });

  it('formats replyTo with anonymous sender', () => {
    const replyTo = {
      id: 'msg_anon',
      content: 'Anon reply',
      originalLanguage: 'en',
      messageType: 'text',
      createdAt: new Date(),
      sender: makeAnonSender(),
    };
    const result = formatMessageWithSeparateSenders(makeMessage({ replyTo }));
    expect(result.replyTo!.anonymousSender).not.toBeNull();
    expect(result.replyTo!.sender).toBeNull();
  });

  it('sets replyTo to null when missing', () => {
    const result = formatMessageWithSeparateSenders(makeMessage({ replyTo: null }));
    expect(result.replyTo).toBeNull();
  });

  it('includes systemLanguage on sender from user', () => {
    const result = formatMessageWithSeparateSenders(makeMessage());
    expect(result.sender!.systemLanguage).toBe('fr');
  });

  it('falls back to fr for missing originalLanguage', () => {
    const result = formatMessageWithSeparateSenders(makeMessage({ originalLanguage: undefined }));
    expect(result.originalLanguage).toBe('fr');
  });
});
