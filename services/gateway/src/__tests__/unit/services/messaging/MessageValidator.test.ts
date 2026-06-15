/**
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { MessageRequest, AuthenticationContext } from '@meeshy/shared/types';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

const mockResolveConvId = jest.fn() as jest.Mock<any>;
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConvId(...args),
}));

import { MessageValidator } from '../../../../services/messaging/MessageValidator';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

function makeMocks() {
  return {
    conversationFindUnique: jest.fn() as jest.Mock<any>,
    conversationFindFirst: jest.fn() as jest.Mock<any>,
    participantFindFirst: jest.fn() as jest.Mock<any>,
    participantFindUnique: jest.fn() as jest.Mock<any>,
    shareLinkFindFirst: jest.fn() as jest.Mock<any>,
    userFindUnique: jest.fn() as jest.Mock<any>,
  };
}

function makePrisma(mocks: ReturnType<typeof makeMocks>): PrismaClient {
  return {
    conversation: {
      findUnique: mocks.conversationFindUnique,
      findFirst: mocks.conversationFindFirst,
    },
    participant: {
      findFirst: mocks.participantFindFirst,
      findUnique: mocks.participantFindUnique,
    },
    conversationShareLink: {
      findFirst: mocks.shareLinkFindFirst,
    },
    user: {
      findUnique: mocks.userFindUnique,
    },
  } as unknown as PrismaClient;
}

function makeRequest(overrides: Partial<MessageRequest> = {}): MessageRequest {
  return {
    conversationId: CONV_ID,
    content: 'Hello world',
    ...overrides,
  } as MessageRequest;
}

function makeAuthContext(overrides: Partial<AuthenticationContext> = {}): AuthenticationContext {
  return {
    isAnonymous: false,
    userId: USER_ID,
    sessionToken: undefined,
    ...overrides,
  } as unknown as AuthenticationContext;
}

// ── validateRequest ────────────────────────────────────────────────────────

describe('MessageValidator.validateRequest', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    mockResolveConvId.mockResolvedValue(CONV_ID);
    const m = makeMocks();
    validator = new MessageValidator(makePrisma(m));
  });

  it('returns valid for a normal message', async () => {
    const result = await validator.validateRequest(makeRequest());
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toBeUndefined();
  });

  it('errors when content is empty and no attachments or payload', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '' }));
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.code === 'CONTENT_EMPTY')).toBe(true);
  });

  it('errors when content is whitespace only', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '   ' }));
    expect(result.errors[0]?.code).toBe('CONTENT_EMPTY');
  });

  it('allows empty content when attachments array is non-empty', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      attachments: [{ id: 'att-1' }] as unknown as MessageRequest['attachments'],
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  it('allows empty content when attachmentIds is non-empty', async () => {
    const result = await validator.validateRequest(makeRequest({ content: '', attachmentIds: ['att-1'] }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  it('allows empty content when encryptedPayload is present', async () => {
    const result = await validator.validateRequest(makeRequest({
      content: '',
      encryptedPayload: { data: 'abc' } as unknown as MessageRequest['encryptedPayload'],
    }));
    expect(result.errors.find(e => e.code === 'CONTENT_EMPTY')).toBeUndefined();
  });

  it('errors when content exceeds MAX_MESSAGE_LENGTH (4000)', async () => {
    const result = await validator.validateRequest(makeRequest({ content: 'x'.repeat(4001) }));
    expect(result.errors.some(e => e.code === 'CONTENT_TOO_LONG')).toBe(true);
    expect(result.isValid).toBe(false);
  });

  it('errors when conversationId is missing', async () => {
    const result = await validator.validateRequest(makeRequest({ conversationId: '' }));
    expect(result.errors.some(e => e.code === 'CONVERSATION_ID_REQUIRED')).toBe(true);
  });

  it('errors when isAnonymous without anonymousDisplayName', async () => {
    const result = await validator.validateRequest(makeRequest({ isAnonymous: true, anonymousDisplayName: '' }));
    expect(result.errors.some(e => e.code === 'ANONYMOUS_NAME_REQUIRED')).toBe(true);
  });

  it('allows missing anonymousDisplayName when isAnonymous is false', async () => {
    const result = await validator.validateRequest(makeRequest({ isAnonymous: false }));
    expect(result.errors.find(e => e.code === 'ANONYMOUS_NAME_REQUIRED')).toBeUndefined();
  });

  it('errors when total attachments exceed 10', async () => {
    const result = await validator.validateRequest(makeRequest({
      attachmentIds: new Array(6).fill('att'),
      attachments: new Array(5).fill({ id: 'att' }) as unknown as MessageRequest['attachments'],
    }));
    expect(result.errors.some(e => e.code === 'TOO_MANY_ATTACHMENTS')).toBe(true);
  });

  it('produces long-content warning when content > 1000 chars', async () => {
    const result = await validator.validateRequest(makeRequest({ content: 'y'.repeat(1001) }));
    expect(result.warnings).toBeDefined();
    expect(result.warnings![0].code).toBe('LONG_CONTENT_WARNING');
  });

  it('accumulates multiple errors', async () => {
    const result = await validator.validateRequest(makeRequest({ conversationId: '', content: '' }));
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
    expect(result.isValid).toBe(false);
  });
});

// ── checkPermissions: global conversation ──────────────────────────────────

describe('MessageValidator.checkPermissions — global conversation', () => {
  let m: ReturnType<typeof makeMocks>;
  let validator: MessageValidator;

  beforeEach(() => {
    m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique.mockResolvedValue({ type: 'global', identifier: 'global' });
    validator = new MessageValidator(makePrisma(m));
  });

  it('allows registered user in global conversation', async () => {
    const result = await validator.checkPermissions(makeAuthContext(), CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
    expect(result.canSendAnonymous).toBe(false);
    expect(result.canAttachFiles).toBe(true);
    expect(result.canMentionUsers).toBe(true);
    expect(result.canUseHighPriority).toBe(false);
  });

  it('sets anonymous flags in global conversation for anonymous user', async () => {
    const result = await validator.checkPermissions(
      makeAuthContext({ isAnonymous: true }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canSend).toBe(true);
    expect(result.canSendAnonymous).toBe(true);
    expect(result.canAttachFiles).toBe(false);
    expect(result.canMentionUsers).toBe(false);
  });
});

// ── checkPermissions: resolve failures ────────────────────────────────────

describe('MessageValidator.checkPermissions — resolve/DB failures', () => {
  it('denies when conversation id resolves to null', async () => {
    mockResolveConvId.mockResolvedValue(null);
    const m = makeMocks();
    const validator = new MessageValidator(makePrisma(m));
    const result = await validator.checkPermissions(makeAuthContext(), CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/non trouvée/);
  });

  it('denies when conversation row is absent in DB', async () => {
    mockResolveConvId.mockResolvedValue(CONV_ID);
    const m = makeMocks();
    m.conversationFindUnique.mockResolvedValue(null);
    const validator = new MessageValidator(makePrisma(m));
    const result = await validator.checkPermissions(makeAuthContext(), CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
  });

  it('denies with error message when prisma throws', async () => {
    mockResolveConvId.mockResolvedValue(CONV_ID);
    const m = makeMocks();
    m.conversationFindUnique.mockRejectedValue(new Error('DB down'));
    const validator = new MessageValidator(makePrisma(m));
    const result = await validator.checkPermissions(makeAuthContext(), CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toContain('DB down');
  });
});

// ── anonymous permissions ──────────────────────────────────────────────────

describe('MessageValidator — anonymous permissions', () => {
  const anonCtx = makeAuthContext({ isAnonymous: true, sessionToken: 'tok-123' });
  const baseShareLink = {
    id: 'sl-1',
    isActive: true,
    allowAnonymousMessages: true,
    allowAnonymousFiles: true,
    allowAnonymousImages: true,
    maxUses: null,
    currentUses: 0,
    expiresAt: null,
    maxConcurrentUsers: null,
    currentConcurrentUsers: 0,
  };
  const baseParticipant = {
    id: 'part-1',
    type: 'anonymous',
    isActive: true,
    sessionTokenHash: 'tok-123',
    permissions: { canSendMessages: true, canSendFiles: true },
  };

  function makeAnonValidator(opts: {
    participant?: object | null;
    shareLink?: object | null;
  }) {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    // First findUnique for the global-check, returns non-global conversation
    m.conversationFindUnique.mockResolvedValue({ type: 'direct', identifier: null });
    m.participantFindFirst.mockResolvedValue(opts.participant ?? null);
    m.shareLinkFindFirst.mockResolvedValue(opts.shareLink ?? null);
    return new MessageValidator(makePrisma(m));
  }

  it('denies when participant not found', async () => {
    const v = makeAnonValidator({ participant: null });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/anonyme/);
  });

  it('denies when no active share link exists', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: null });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/lien/);
  });

  it('denies when share link has isActive=false', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, isActive: false } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/désactivé/);
  });

  it('denies when share link is expired', async () => {
    const past = new Date(Date.now() - 1000);
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, expiresAt: past } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/expiré/);
  });

  it('denies when maxUses reached', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, maxUses: 5, currentUses: 5 } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/limite/i);
  });

  it('denies when allowAnonymousMessages is false', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, allowAnonymousMessages: false } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
  });

  it('denies when participant canSendMessages is false', async () => {
    const v = makeAnonValidator({
      participant: { ...baseParticipant, permissions: { canSendMessages: false, canSendFiles: false } },
      shareLink: baseShareLink,
    });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/révoqué/);
  });

  it('denies when permissions is null', async () => {
    const v = makeAnonValidator({
      participant: { ...baseParticipant, permissions: null },
      shareLink: baseShareLink,
    });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
  });

  it('allows with full permissions when all checks pass', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: baseShareLink });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
    expect(result.canAttachFiles).toBe(true);
    expect(result.restrictions?.allowedAttachmentTypes).toContain('image');
    expect(result.restrictions?.maxContentLength).toBe(1000);
    expect(result.restrictions?.rateLimitRemaining).toBe(20);
  });

  it('restricts to files only when allowAnonymousImages is false', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, allowAnonymousImages: false } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
    expect(result.restrictions?.allowedAttachmentTypes).not.toContain('image');
    expect(result.restrictions?.allowedAttachmentTypes).toContain('file');
  });

  it('disallows file attachments when allowAnonymousFiles is false', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, allowAnonymousFiles: false } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canAttachFiles).toBe(false);
    expect(result.restrictions?.allowedAttachmentTypes).toHaveLength(0);
    expect(result.restrictions?.maxAttachments).toBe(0);
  });

  it('allows future expiry dates (not yet expired)', async () => {
    const future = new Date(Date.now() + 86400000);
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, expiresAt: future } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('allows when maxUses is null (no limit)', async () => {
    const v = makeAnonValidator({ participant: baseParticipant, shareLink: { ...baseShareLink, maxUses: null, currentUses: 100 } });
    const result = await v.checkPermissions(anonCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });
});

// ── registered user permissions ────────────────────────────────────────────

describe('MessageValidator — registered user permissions', () => {
  const regCtx = makeAuthContext({ isAnonymous: false, userId: USER_ID });
  const baseMembership = { id: 'mem-1', role: 'member', permissions: { canSendMessages: true, canSendFiles: true } };
  const baseConversation = { type: 'direct', isAnnouncementChannel: false, defaultWriteRole: null };

  function makeRegValidator(opts: {
    membership?: object | null;
    conversationType?: string;
    isAnnouncementChannel?: boolean;
    defaultWriteRole?: string | null;
    memberRole?: string;
    globalRole?: string;
  }) {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    const conv = {
      type: opts.conversationType ?? 'direct',
      isAnnouncementChannel: opts.isAnnouncementChannel ?? false,
      defaultWriteRole: opts.defaultWriteRole ?? null,
    };
    // First findUnique call (in checkPermissions for initial global-type check)
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: opts.conversationType ?? 'direct', identifier: null })
      // Second findUnique call (in checkRegisteredUserPermissions)
      .mockResolvedValueOnce(conv);
    m.participantFindFirst.mockResolvedValue(
      opts.membership !== undefined ? opts.membership : { ...baseMembership, role: opts.memberRole ?? 'member' }
    );
    if (opts.globalRole) {
      m.userFindUnique.mockResolvedValue({ role: opts.globalRole });
    } else {
      m.userFindUnique.mockResolvedValue({ role: 'USER' });
    }
    return new MessageValidator(makePrisma(m));
  }

  it('denies when user is not a member', async () => {
    const v = makeRegValidator({ membership: null });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/membre/);
  });

  it('denies when conversation row not found (second findUnique)', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: 'direct', identifier: null })
      .mockResolvedValueOnce(null);
    m.participantFindFirst.mockResolvedValue(baseMembership);
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
  });

  it('allows member in regular direct conversation', async () => {
    const v = makeRegValidator({});
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
    expect(result.canAttachFiles).toBe(true);
    expect(result.canMentionUsers).toBe(true);
    expect(result.restrictions?.maxAttachments).toBe(100);
  });

  it('denies member in announcement channel', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: true, memberRole: 'member', globalRole: 'USER' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/annonce/);
  });

  it('allows admin in announcement channel', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: true, memberRole: 'admin' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('allows global ADMIN platform user to bypass announcement restriction', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: true, memberRole: 'member', globalRole: 'ADMIN' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('allows global BIGBOSS to bypass announcement restriction', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: true, memberRole: 'member', globalRole: 'BIGBOSS' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('allows global MODERATOR to bypass announcement restriction', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: true, memberRole: 'member', globalRole: 'MODERATOR' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('denies member when defaultWriteRole requires moderator', async () => {
    const v = makeRegValidator({ conversationType: 'group', defaultWriteRole: 'moderator', memberRole: 'member', globalRole: 'USER' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
    expect(result.reason).toMatch(/rôle/i);
  });

  it('allows moderator when defaultWriteRole is moderator', async () => {
    const v = makeRegValidator({ conversationType: 'group', defaultWriteRole: 'moderator', memberRole: 'moderator' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(true);
  });

  it('disables highPriority for public conversations', async () => {
    const v = makeRegValidator({ conversationType: 'public' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canUseHighPriority).toBe(false);
  });

  it('disables highPriority for broadcast conversations', async () => {
    const v = makeRegValidator({ conversationType: 'broadcast', isAnnouncementChannel: false });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canUseHighPriority).toBe(false);
  });

  it('enables highPriority for non-public conversations', async () => {
    const v = makeRegValidator({ conversationType: 'group' });
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canUseHighPriority).toBe(true);
  });

  it('respects member canSendMessages permission (false)', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: 'direct', identifier: null })
      .mockResolvedValueOnce(baseConversation);
    m.participantFindFirst.mockResolvedValue({ ...baseMembership, permissions: { canSendMessages: false, canSendFiles: true } });
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(regCtx, CONV_ID, makeRequest());
    expect(result.canSend).toBe(false);
  });
});

// ── resolveConversationId ─────────────────────────────────────────────────

describe('MessageValidator.resolveConversationId', () => {
  it('delegates to conversation-id-cache utility', async () => {
    mockResolveConvId.mockResolvedValue('resolved-id');
    const m = makeMocks();
    const validator = new MessageValidator(makePrisma(m));
    const id = await validator.resolveConversationId('some-identifier');
    expect(id).toBe('resolved-id');
    expect(mockResolveConvId).toHaveBeenCalled();
  });

  it('returns null when identifier cannot be resolved', async () => {
    mockResolveConvId.mockResolvedValue(null);
    const m = makeMocks();
    const validator = new MessageValidator(makePrisma(m));
    const id = await validator.resolveConversationId('unknown-id');
    expect(id).toBeNull();
  });
});

// ── detectLanguage ────────────────────────────────────────────────────────

describe('MessageValidator.detectLanguage', () => {
  let validator: MessageValidator;
  let mockFetch: jest.Mock<any>;

  beforeEach(() => {
    mockFetch = jest.fn() as jest.Mock<any>;
    (global as unknown as { fetch: unknown }).fetch = mockFetch;
    const m = makeMocks();
    validator = new MessageValidator(makePrisma(m));
  });

  afterEach(() => {
    delete (global as unknown as Record<string, unknown>).fetch;
  });

  it('returns detected language on success', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: 'es' }) });
    const lang = await validator.detectLanguage('Hola mundo');
    expect(lang).toBe('es');
  });

  it('returns fr when response is not ok', async () => {
    mockFetch.mockResolvedValue({ ok: false });
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('returns fr when fetch throws', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('returns fr when language field is empty string', async () => {
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: '' }) });
    const lang = await validator.detectLanguage('some text');
    expect(lang).toBe('fr');
  });

  it('truncates content to 5000 chars before sending', async () => {
    const longText = 'a'.repeat(10000);
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ language: 'en' }) });
    await validator.detectLanguage(longText);
    const callOpts = mockFetch.mock.calls[0][1] as { body: string };
    const body = JSON.parse(callOpts.body) as { text: string };
    expect(body.text.length).toBe(5000);
  });
});

// ── Branch-coverage gap-fillers ───────────────────────────────────────────

describe('MessageValidator — branch gap coverage', () => {
  // Line 141: error instanceof Error ? … : 'Erreur inconnue'
  // Throw a non-Error value so the false-branch of the ternary executes.
  it('returns Erreur inconnue in permission error message when thrown value is not an Error', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    // Make conversation.findUnique throw a plain string, not an Error
    m.conversationFindUnique.mockRejectedValue('something bad');
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: false, userId: USER_ID }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canSend).toBe(false);
    expect(result.reason).toContain('Erreur inconnue');
  });

  // Line 153: authContext.sessionToken || authContext.userId || ''
  // Both fields absent → identifier falls through to ''.
  it('falls back to empty identifier when both sessionToken and userId are absent', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique.mockResolvedValue({ type: 'direct', identifier: null });
    m.participantFindFirst.mockResolvedValue(null); // anonymous, not found
    m.shareLinkFindFirst.mockResolvedValue(null);
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: true, userId: undefined as unknown as string, sessionToken: undefined }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canSend).toBe(false);
  });

  // Line 225: participant.permissions?.canSendFiles ?? false
  // permissions is non-null but canSendFiles is undefined → ?? false resolves to false.
  it('canAttachFiles is false when permissions.canSendFiles is undefined', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique.mockResolvedValue({ type: 'direct', identifier: null });
    m.participantFindFirst.mockResolvedValue({
      id: 'part-1', type: 'anonymous', isActive: true, sessionTokenHash: 'tok',
      permissions: { canSendMessages: true, canSendFiles: undefined },
    });
    m.shareLinkFindFirst.mockResolvedValue({
      id: 'sl-1', isActive: true, allowAnonymousMessages: true,
      allowAnonymousFiles: true, allowAnonymousImages: false,
      maxUses: null, currentUses: 0, expiresAt: null,
      maxConcurrentUsers: null, currentConcurrentUsers: 0,
    });
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: true, userId: undefined as unknown as string, sessionToken: 'tok' }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canAttachFiles).toBe(false);
  });

  // Lines 274-276: roleHierarchy[membership.role] ?? 0 when role is not in hierarchy
  it('uses level 0 for unknown membership role in restricted channel', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: 'group', identifier: null })
      .mockResolvedValueOnce({ type: 'group', isAnnouncementChannel: true, defaultWriteRole: null });
    m.participantFindFirst.mockResolvedValue({
      id: 'mem-1', role: 'viewer', permissions: { canSendMessages: true, canSendFiles: true }
    });
    m.userFindUnique.mockResolvedValue({ role: 'USER' });
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: false, userId: USER_ID }),
      CONV_ID,
      makeRequest()
    );
    // 'viewer' not in hierarchy → level 0 < admin level 3 → denied
    expect(result.canSend).toBe(false);
  });

  // Line 285: user?.role || '' when user lookup returns null
  it('treats null user as non-admin (empty role string)', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: 'broadcast', identifier: null })
      .mockResolvedValueOnce({ type: 'broadcast', isAnnouncementChannel: true, defaultWriteRole: null });
    m.participantFindFirst.mockResolvedValue({
      id: 'mem-1', role: 'member', permissions: { canSendMessages: true, canSendFiles: true }
    });
    // user lookup returns null → role treated as ''
    m.userFindUnique.mockResolvedValue(null);
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: false, userId: USER_ID }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canSend).toBe(false);
  });

  // Lines 298-300: membership.permissions?.canSendMessages ?? true
  // permissions is null → ?? true used for both canSend and canAttachFiles.
  it('defaults canSend and canAttachFiles to true when membership permissions is null', async () => {
    const m = makeMocks();
    mockResolveConvId.mockResolvedValue(CONV_ID);
    m.conversationFindUnique
      .mockResolvedValueOnce({ type: 'direct', identifier: null })
      .mockResolvedValueOnce({ type: 'direct', isAnnouncementChannel: false, defaultWriteRole: null });
    m.participantFindFirst.mockResolvedValue({ id: 'mem-1', role: 'member', permissions: null });
    const v = new MessageValidator(makePrisma(m));
    const result = await v.checkPermissions(
      makeAuthContext({ isAnonymous: false, userId: USER_ID }),
      CONV_ID,
      makeRequest()
    );
    expect(result.canSend).toBe(true);
    expect(result.canAttachFiles).toBe(true);
  });
});
