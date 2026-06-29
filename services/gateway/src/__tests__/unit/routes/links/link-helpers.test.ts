/**
 * link-helpers unit tests
 *
 * @jest-environment node
 */

import {
  createLegacyHybridRequest,
  resolveShareLinkId,
  generateFinalLinkId,
  generateInitialLinkId,
  generateConversationIdentifier,
  ensureUniqueShareLinkIdentifier,
} from '../../../../routes/links/utils/link-helpers';
import type { UnifiedAuthRequest } from '../../../../middleware/auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRegisteredUserRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      hasFullAccess: true,
      displayName: 'Alice Dupont',
      userLanguage: 'fr',
      canSendMessages: true,
      registeredUser: {
        id: 'user_001',
        username: 'alice',
        email: 'alice@meeshy.me',
        role: 'USER',
        systemLanguage: 'fr',
        regionalLanguage: 'fr',
      } as any,
    },
  } as unknown as UnifiedAuthRequest;
}

function makeAnonymousUserRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'anonymous',
      isAuthenticated: true,
      isAnonymous: true,
      hasFullAccess: false,
      displayName: 'Guest User',
      userLanguage: 'en',
      canSendMessages: true,
      anonymousUser: {
        id: 'anon_001',
        sessionToken: 'sess_abc',
        username: 'GuestUser',
        firstName: 'Guest',
        lastName: 'User',
        language: 'en',
        shareLinkId: 'link_001',
        permissions: {
          canSendMessages: true,
          canSendFiles: false,
          canSendImages: true,
        },
      },
    },
  } as unknown as UnifiedAuthRequest;
}

function makeUnauthenticatedRequest(): UnifiedAuthRequest {
  return {
    authContext: {
      type: 'anonymous',
      isAuthenticated: false,
      isAnonymous: true,
      hasFullAccess: false,
      displayName: '',
      userLanguage: 'en',
      canSendMessages: false,
    },
  } as unknown as UnifiedAuthRequest;
}

function makePrisma(shareLink: { id: string } | null = null) {
  return {
    conversationShareLink: {
      findFirst: jest.fn().mockResolvedValue(shareLink),
    },
  } as any;
}

// ---------------------------------------------------------------------------
// createLegacyHybridRequest
// ---------------------------------------------------------------------------

describe('createLegacyHybridRequest', () => {
  it('returns registered user shape for authenticated registered user', () => {
    const result = createLegacyHybridRequest(makeRegisteredUserRequest());
    expect(result.isAuthenticated).toBe(true);
    expect(result.isAnonymous).toBe(false);
    expect(result.user).toBeDefined();
    expect(result.user.id).toBe('user_001');
    expect(result.anonymousParticipant).toBeNull();
  });

  it('returns anonymous participant shape for anonymous user', () => {
    const result = createLegacyHybridRequest(makeAnonymousUserRequest());
    expect(result.isAuthenticated).toBe(true);
    expect(result.isAnonymous).toBe(true);
    expect(result.user).toBeNull();
    expect(result.anonymousParticipant).not.toBeNull();
    expect(result.anonymousParticipant.id).toBe('sess_abc');
    expect(result.anonymousParticipant.username).toBe('GuestUser');
    expect(result.anonymousParticipant.canSendMessages).toBe(true);
    expect(result.anonymousParticipant.canSendFiles).toBe(false);
  });

  it('returns unauthenticated shape when no user is present', () => {
    const result = createLegacyHybridRequest(makeUnauthenticatedRequest());
    expect(result.isAuthenticated).toBe(false);
    expect(result.isAnonymous).toBe(false);
    expect(result.user).toBeNull();
    expect(result.anonymousParticipant).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// resolveShareLinkId
// ---------------------------------------------------------------------------

describe('resolveShareLinkId', () => {
  it('returns identifier directly when it is a 24-char hex ObjectId', async () => {
    const id = 'a'.repeat(24);
    const prisma = makePrisma();
    const result = await resolveShareLinkId(prisma, id);
    expect(result).toBe(id);
    expect(prisma.conversationShareLink.findFirst).not.toHaveBeenCalled();
  });

  it('queries by identifier when input is not an ObjectId', async () => {
    const prisma = makePrisma({ id: 'found_id_xyz' });
    const result = await resolveShareLinkId(prisma, 'my-share-link');
    expect(result).toBe('found_id_xyz');
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledWith({
      where: { identifier: 'my-share-link' },
    });
  });

  it('returns null when share link not found', async () => {
    const prisma = makePrisma(null);
    const result = await resolveShareLinkId(prisma, 'no-such-link');
    expect(result).toBeNull();
  });

  it('accepts exactly 24 hex chars (ObjectId boundary)', async () => {
    const id = '0123456789abcdef01234567';
    const prisma = makePrisma();
    const result = await resolveShareLinkId(prisma, id);
    expect(result).toBe(id);
  });

  it('queries when identifier is 23 chars (not 24)', async () => {
    const prisma = makePrisma({ id: 'found' });
    await resolveShareLinkId(prisma, '0'.repeat(23));
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// generateInitialLinkId
// ---------------------------------------------------------------------------

describe('generateInitialLinkId', () => {
  it('returns a string in the format YYMMDDHHMI_xxxxxxxx', () => {
    const result = generateInitialLinkId();
    expect(result).toMatch(/^\d{10}_[a-z0-9]{8}$/);
  });

  it('returns different values on consecutive calls (probabilistic)', () => {
    const a = generateInitialLinkId();
    const b = generateInitialLinkId();
    // Extremely unlikely to be equal (1/36^8 chance)
    expect(typeof a).toBe('string');
    expect(typeof b).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// generateConversationIdentifier
// ---------------------------------------------------------------------------

describe('generateConversationIdentifier', () => {
  it('returns a string starting with mshy_', () => {
    expect(generateConversationIdentifier()).toMatch(/^mshy_/);
  });

  it('includes sanitized title when provided', () => {
    const result = generateConversationIdentifier('My Conversation');
    expect(result).toContain('my-conversation');
    expect(result.startsWith('mshy_')).toBe(true);
  });

  it('strips special characters from title', () => {
    const result = generateConversationIdentifier('Hello! World?');
    expect(result).toMatch(/^mshy_helloworld-\d+$|^mshy_hello-world-\d+$/);
  });

  it('falls back to random ID when title is empty string', () => {
    const result = generateConversationIdentifier('');
    expect(result).toMatch(/^mshy_[a-z0-9]+-\d+$/);
  });

  it('falls back to random ID when title reduces to empty after sanitization', () => {
    const result = generateConversationIdentifier('!!! ---');
    expect(result).toMatch(/^mshy_[a-z0-9]+-\d+$/);
  });

  it('falls back to random ID when title is undefined', () => {
    const result = generateConversationIdentifier(undefined);
    expect(result).toMatch(/^mshy_[a-z0-9]+-\d+$/);
  });

  it('includes a numeric timestamp suffix', () => {
    const result = generateConversationIdentifier('test');
    // Suffix should be digits (YYYYMMDDHHMMSS format)
    expect(result).toMatch(/-\d{14}$/);
  });
});

// ---------------------------------------------------------------------------
// generateFinalLinkId
// ---------------------------------------------------------------------------

describe('generateFinalLinkId', () => {
  it('generates mshy_{shareId}.{initialId} format', () => {
    const result = generateFinalLinkId('abc123', 'init456');
    expect(result).toBe('mshy_abc123.init456');
  });

  it('prefixes with mshy_', () => {
    expect(generateFinalLinkId('x', 'y').startsWith('mshy_')).toBe(true);
  });

  it('includes a dot separator between ids', () => {
    expect(generateFinalLinkId('share', 'init')).toContain('.');
  });
});

// ---------------------------------------------------------------------------
// ensureUniqueShareLinkIdentifier
// ---------------------------------------------------------------------------

describe('ensureUniqueShareLinkIdentifier', () => {
  it('returns base identifier when no conflict exists', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toBe('my-link');
  });

  it('appends timestamp when base identifier conflicts', async () => {
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'existing' })  // first call: base conflicts
          .mockResolvedValueOnce(null),               // second call: timestamped is free
      },
    } as any;
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toMatch(/^my-link-\d+$/);
  });

  it('appends counter when base+timestamp also conflicts', async () => {
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'base' })         // base conflicts
          .mockResolvedValueOnce({ id: 'timestamp' })    // base+timestamp conflicts
          .mockResolvedValueOnce(null),                  // base+timestamp+1 free
      },
    } as any;
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toMatch(/-1$/);
  });

  it('generates a fallback when identifier is empty string', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, '');
    expect(result).toMatch(/^mshy_link-/);
  });

  it('generates a fallback when identifier is whitespace', async () => {
    const prisma = makePrisma(null);
    const result = await ensureUniqueShareLinkIdentifier(prisma, '   ');
    expect(result).toMatch(/^mshy_link-/);
  });

  it('increments counter past 1 when multiple conflicts exist (covers counter++ branch)', async () => {
    const prisma = {
      conversationShareLink: {
        findFirst: jest.fn()
          .mockResolvedValueOnce({ id: 'base' })         // base conflicts
          .mockResolvedValueOnce({ id: 'ts' })           // base+timestamp conflicts
          .mockResolvedValueOnce({ id: 'ts1' })          // base+timestamp+1 conflicts
          .mockResolvedValueOnce(null),                  // base+timestamp+2 is free
      },
    } as any;
    const result = await ensureUniqueShareLinkIdentifier(prisma, 'my-link');
    expect(result).toMatch(/-2$/);
    expect(prisma.conversationShareLink.findFirst).toHaveBeenCalledTimes(4);
  });
});
