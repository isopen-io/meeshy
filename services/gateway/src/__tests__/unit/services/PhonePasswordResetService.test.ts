/**
 * PhonePasswordResetService Unit Tests
 *
 * Covers:
 * - maskEmail / maskUsername / maskDisplayName pure helpers
 * - lookupByPhone(): rate limit, invalid phone, user not found,
 *   phone not verified, success, internal error
 * - verifyIdentity(): token not found, revoked, expired, wrong step,
 *   max identity attempts, mismatch (username/email), SMS failure, success
 * - verifyCode(): token not found, revoked/used, expired, wrong step,
 *   max code attempts, invalid code, success (generates reset token)
 * - resendCode(): not found/revoked, wrong step, rate limited, SMS failure, success
 * - transferPhone(): success, internal error
 *
 * @jest-environment node
 */

const mockNormalizePhone = jest.fn();

jest.mock('../../../utils/normalize', () => ({
  normalizePhoneWithCountry: (...args: unknown[]) => mockNormalizePhone(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import crypto from 'crypto';
import {
  PhonePasswordResetService,
  maskEmail,
  maskUsername,
  maskDisplayName,
} from '../../../services/PhonePasswordResetService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function codeHash(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST   = new Date(Date.now() - 60 * 60 * 1000);

function makeToken(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tok_001',
    userId: 'user_001',
    isRevoked: false,
    usedAt: null,
    expiresAt: FUTURE,
    verificationStep: 'IDENTITY_PENDING',
    identityAttempts: 0,
    codeAttempts: 0,
    codeHash: codeHash('123456'),
    user: {
      id: 'user_001',
      username: 'johndoe',
      email: 'john@example.com',
      phoneNumber: '+15550001234',
      firstName: 'John',
      lastName: 'Doe',
    },
    ...overrides,
  };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_001',
    username: 'johndoe',
    email: 'john@example.com',
    displayName: 'John Doe',
    avatar: null,
    phoneVerifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function makePrisma(overrides: {
  userFindFirst?: Record<string, jest.Mock>;
  phoneTokenFindUnique?: Record<string, jest.Mock>;
  phoneTokenCreate?: Record<string, jest.Mock>;
  phoneTokenUpdate?: Record<string, jest.Mock>;
  phoneTokenUpdateMany?: Record<string, jest.Mock>;
  passwordResetCreate?: Record<string, jest.Mock>;
  securityEventCreate?: Record<string, jest.Mock>;
  transaction?: jest.Mock;
} = {}) {
  return {
    user: {
      findFirst: (overrides.userFindFirst?.findFirst ?? jest.fn().mockResolvedValue(null)) as jest.Mock,
      update: jest.fn().mockResolvedValue({}),
    },
    phonePasswordResetToken: {
      findUnique: (overrides.phoneTokenFindUnique?.findUnique ?? jest.fn().mockResolvedValue(null)) as jest.Mock,
      create: (overrides.phoneTokenCreate?.create ?? jest.fn().mockResolvedValue({ id: 'tok_001' })) as jest.Mock,
      update: jest.fn().mockResolvedValue({}),
      updateMany: (overrides.phoneTokenUpdateMany?.updateMany ?? jest.fn().mockResolvedValue({ count: 1 })) as jest.Mock,
    },
    passwordResetToken: {
      create: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: overrides.transaction ?? jest.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        user: { update: jest.fn().mockResolvedValue({}) },
        securityEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    }),
  } as any;
}

function makeCache(getValue: string | null = null) {
  return {
    get: jest.fn().mockResolvedValue(getValue),
    set: jest.fn().mockResolvedValue(undefined),
  } as any;
}

function makeSms(success = true) {
  return {
    sendPasswordResetCode: jest.fn().mockResolvedValue({ success, provider: 'twilio', error: success ? undefined : 'SMS failed' }),
  } as any;
}

function makeGeo(location: string | null = 'US') {
  return {
    lookup: jest.fn().mockResolvedValue(location !== null ? { location } : null),
  } as any;
}

const LOOKUP_REQUEST = {
  phoneNumber: '+15550001234',
  countryCode: 'US',
  ipAddress: '1.2.3.4',
  userAgent: 'test-agent',
};

const IDENTITY_REQUEST = {
  tokenId: 'tok_001',
  fullUsername: 'johndoe',
  fullEmail: 'john@example.com',
  ipAddress: '1.2.3.4',
  userAgent: 'test-agent',
};

const CODE_REQUEST = {
  tokenId: 'tok_001',
  code: '123456',
  ipAddress: '1.2.3.4',
  userAgent: 'test-agent',
};

// ---------------------------------------------------------------------------
// maskEmail
// ---------------------------------------------------------------------------
describe('maskEmail', () => {
  it('masks a standard email correctly', () => {
    // "jean@facebook.com" → "je....n@f*****om"
    expect(maskEmail('jean@facebook.com')).toContain('@');
    expect(maskEmail('jean@facebook.com')).toMatch(/^j/);
  });

  it('returns default mask for email without @', () => {
    expect(maskEmail('noemail')).toBe('***@***.***');
  });

  it('handles short local part (≤ 3 chars)', () => {
    const result = maskEmail('ab@example.com');
    expect(result).toMatch(/^a/);
    expect(result).toContain('***');
  });

  it('handles email with subdomain TLD', () => {
    const result = maskEmail('user@mail.example.co.uk');
    expect(result).toContain('@');
  });

  it('returns *** default for empty string', () => {
    expect(maskEmail('')).toBe('***@***.***');
  });

  it('lowercases the email before masking', () => {
    const upper = maskEmail('JEAN@FACEBOOK.COM');
    const lower = maskEmail('jean@facebook.com');
    expect(upper).toBe(lower);
  });
});

// ---------------------------------------------------------------------------
// maskUsername
// ---------------------------------------------------------------------------
describe('maskUsername', () => {
  it('masks a standard username keeping first and last char', () => {
    const result = maskUsername('johndoe');
    expect(result[0]).toBe('j');
    expect(result[result.length - 1]).toBe('e');
    expect(result).toContain('*');
  });

  it('handles 2-char username', () => {
    const result = maskUsername('ab');
    expect(result).toBe('a*');
  });

  it('handles 1-char username', () => {
    const result = maskUsername('a');
    expect(result).toBe('a*');
  });

  it('returns default for empty string', () => {
    expect(maskUsername('')).toBe('********');
  });

  it('caps middle stars at 6', () => {
    const result = maskUsername('averylongusername');
    expect(result.replace(/[^*]/g, '').length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// maskDisplayName
// ---------------------------------------------------------------------------
describe('maskDisplayName', () => {
  it('masks each word keeping first and last char', () => {
    const result = maskDisplayName('John Doe');
    expect(result).toContain('J');
    expect(result).toContain('D');
  });

  it('handles null input', () => {
    expect(maskDisplayName(null)).toBe('*** ***');
  });

  it('handles undefined input', () => {
    expect(maskDisplayName(undefined)).toBe('*** ***');
  });

  it('handles empty string', () => {
    expect(maskDisplayName('')).toBe('*** ***');
  });

  it('handles single-character words', () => {
    const result = maskDisplayName('A B');
    expect(result).toContain('A');
    expect(result).toContain('B');
  });

  it('handles a single name', () => {
    const result = maskDisplayName('Alice');
    expect(result[0]).toBe('A');
    expect(result[result.length - 1]).toBe('e');
  });
});

// ---------------------------------------------------------------------------
// lookupByPhone
// ---------------------------------------------------------------------------
describe('PhonePasswordResetService — lookupByPhone', () => {
  beforeEach(() => {
    mockNormalizePhone.mockReturnValue({ isValid: true, phoneNumber: '+15550001234' });
  });

  afterEach(() => jest.clearAllMocks());

  it('returns rate_limited when IP exceeds rate limit', async () => {
    const cache = makeCache('5'); // count already at limit
    const prisma = makePrisma();
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'rate_limited' });
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('returns invalid_phone when normalization fails', async () => {
    mockNormalizePhone.mockReturnValue({ isValid: false });
    const cache = makeCache(null);
    const svc = new PhonePasswordResetService(makePrisma(), cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'invalid_phone' });
  });

  it('returns invalid_phone when normalization returns null', async () => {
    mockNormalizePhone.mockReturnValue(null);
    const cache = makeCache(null);
    const svc = new PhonePasswordResetService(makePrisma(), cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'invalid_phone' });
  });

  it('returns user_not_found when no user has that phone', async () => {
    const cache = makeCache(null);
    const prisma = makePrisma({
      userFindFirst: { findFirst: jest.fn().mockResolvedValue(null) },
    });
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'user_not_found' });
  });

  it('returns phone_not_verified when user phone is unverified', async () => {
    const cache = makeCache(null);
    const prisma = makePrisma({
      userFindFirst: { findFirst: jest.fn().mockResolvedValue(makeUser({ phoneVerifiedAt: null })) },
    });
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'phone_not_verified' });
  });

  it('returns masked user info and tokenId on success', async () => {
    const cache = makeCache(null);
    const prisma = makePrisma({
      userFindFirst: { findFirst: jest.fn().mockResolvedValue(makeUser()) },
      phoneTokenCreate: { create: jest.fn().mockResolvedValue({ id: 'tok_generated' }) },
    });
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result.success).toBe(true);
    expect(result.tokenId).toBe('tok_generated');
    expect(result.maskedUserInfo).toBeDefined();
    expect(result.maskedUserInfo?.displayName).toBe('John Doe');
    expect(result.maskedUserInfo?.username).not.toBe('johndoe'); // masked
    expect(result.maskedUserInfo?.email).not.toBe('john@example.com'); // masked
  });

  it('uses username as displayName when displayName is null', async () => {
    const cache = makeCache(null);
    const prisma = makePrisma({
      userFindFirst: { findFirst: jest.fn().mockResolvedValue(makeUser({ displayName: null })) },
    });
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result.maskedUserInfo?.displayName).toBe('johndoe');
  });

  it('increments rate limit counter in cache', async () => {
    const cache = makeCache(null);
    const prisma = makePrisma({
      userFindFirst: { findFirst: jest.fn().mockResolvedValue(makeUser()) },
    });
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());

    await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('1.2.3.4'),
      '1',
      expect.any(Number)
    );
  });

  it('returns internal_error on unexpected exception', async () => {
    const cache = { get: jest.fn().mockRejectedValue(new Error('Redis down')), set: jest.fn() } as any;
    const svc = new PhonePasswordResetService(makePrisma(), cache, makeSms(), makeGeo());

    const result = await svc.lookupByPhone(LOOKUP_REQUEST);

    expect(result).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// verifyIdentity
// ---------------------------------------------------------------------------
describe('PhonePasswordResetService — verifyIdentity', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns invalid_token when token is not found', async () => {
    const prisma = makePrisma();
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'invalid_token' });
  });

  it('returns token_expired when token is revoked', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ isRevoked: true })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'token_expired' });
  });

  it('returns token_expired when token has been used', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ usedAt: new Date() })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'token_expired' });
  });

  it('returns token_expired when token has expired', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ expiresAt: PAST })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'token_expired' });
  });

  it('returns invalid_step when verificationStep is not IDENTITY_PENDING', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ verificationStep: 'CODE_PENDING' })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'invalid_step' });
  });

  it('returns max_attempts_exceeded when the attempt cannot be consumed (cap reached) and revokes token', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ identityAttempts: 3 })) },
      phoneTokenUpdateMany: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    const result = await svc.verifyIdentity(IDENTITY_REQUEST);

    expect(result).toEqual({ success: false, error: 'max_attempts_exceeded' });
    expect(prisma.phonePasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRevoked: true } })
    );
  });

  it('consumes an identity attempt atomically with a conditional cap guard (no check-then-act)', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ identityAttempts: 0 })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    await svc.verifyIdentity({ ...IDENTITY_REQUEST, fullUsername: 'wronguser' });

    expect(prisma.phonePasswordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tok_001', identityAttempts: { lt: 3 } }),
        data: { identityAttempts: { increment: 1 } },
      })
    );
    // The consume replaces the old failure-path .update increment (no double count).
    expect(prisma.phonePasswordResetToken.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { identityAttempts: { increment: 1 } } })
    );
  });

  it('returns identity_mismatch with attemptsRemaining when username is wrong', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ identityAttempts: 0 })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    const result = await svc.verifyIdentity({
      ...IDENTITY_REQUEST,
      fullUsername: 'wronguser',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('identity_mismatch');
    expect(result.attemptsRemaining).toBe(2);
  });

  it('returns identity_mismatch with attemptsRemaining when email is wrong', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ identityAttempts: 1 })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    const result = await svc.verifyIdentity({
      ...IDENTITY_REQUEST,
      fullEmail: 'wrong@example.com',
    });

    expect(result.error).toBe('identity_mismatch');
    expect(result.attemptsRemaining).toBe(1);
  });

  it('performs case-insensitive username and email comparison', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const sms = makeSms(true);
    const svc = new PhonePasswordResetService(prisma, makeCache(), sms, makeGeo());

    const result = await svc.verifyIdentity({
      ...IDENTITY_REQUEST,
      fullUsername: 'JOHNDOE',
      fullEmail: 'JOHN@EXAMPLE.COM',
    });

    expect(result.success).toBe(true);
  });

  it('returns sms_send_failed when SMS delivery fails', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(false), makeGeo());

    const result = await svc.verifyIdentity(IDENTITY_REQUEST);

    expect(result).toEqual({ success: false, error: 'sms_send_failed' });
  });

  it('returns success and codeSent:true on happy path', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(true), makeGeo());

    const result = await svc.verifyIdentity(IDENTITY_REQUEST);

    expect(result).toEqual({ success: true, codeSent: true });
  });

  it('updates token to CODE_PENDING step on success', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(true), makeGeo());

    await svc.verifyIdentity(IDENTITY_REQUEST);

    expect(prisma.phonePasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStep: 'CODE_PENDING' }),
      })
    );
  });

  it('returns internal_error on unexpected exception', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockRejectedValue(new Error('DB error')) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    expect(await svc.verifyIdentity(IDENTITY_REQUEST)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// verifyCode
// ---------------------------------------------------------------------------
describe('PhonePasswordResetService — verifyCode', () => {
  afterEach(() => jest.clearAllMocks());

  const CODE_TOKEN = () => makeToken({ verificationStep: 'CODE_PENDING', codeHash: codeHash('123456') });

  it('returns invalid_token when token is not found', async () => {
    const svc = new PhonePasswordResetService(makePrisma(), makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'invalid_token' });
  });

  it('returns token_expired when token is revoked', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    (prisma.phonePasswordResetToken.findUnique as jest.Mock).mockResolvedValue({ ...CODE_TOKEN(), isRevoked: true });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'token_expired' });
  });

  it('returns token_expired when token has been used', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue({ ...CODE_TOKEN(), usedAt: new Date() }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'token_expired' });
  });

  it('returns code_expired when token has expired', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue({ ...CODE_TOKEN(), expiresAt: PAST }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'code_expired' });
  });

  it('returns invalid_step when not CODE_PENDING', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ verificationStep: 'IDENTITY_PENDING' })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'invalid_step' });
  });

  it('returns max_attempts_exceeded when the attempt cannot be consumed (cap reached) and revokes token', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue({ ...CODE_TOKEN(), codeAttempts: 5 }) },
      phoneTokenUpdateMany: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    const result = await svc.verifyCode(CODE_REQUEST);
    expect(result).toEqual({ success: false, error: 'max_attempts_exceeded' });
    expect(prisma.phonePasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isRevoked: true } })
    );
  });

  it('returns invalid_code for wrong code', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    const result = await svc.verifyCode({ ...CODE_REQUEST, code: '999999' });
    expect(result).toEqual({ success: false, error: 'invalid_code' });
  });

  it('consumes a code attempt atomically with a conditional cap guard (no check-then-act)', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    await svc.verifyCode({ ...CODE_REQUEST, code: '000000' });
    expect(prisma.phonePasswordResetToken.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'tok_001', codeAttempts: { lt: 5 } }),
        data: { codeAttempts: { increment: 1 } },
      })
    );
    // The consume replaces the old failure-path .update increment (no double count).
    expect(prisma.phonePasswordResetToken.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: { codeAttempts: { increment: 1 } } })
    );
  });

  it('returns success with resetToken for correct code', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    const result = await svc.verifyCode(CODE_REQUEST);
    expect(result.success).toBe(true);
    expect(typeof result.resetToken).toBe('string');
    expect(result.resetToken!.length).toBeGreaterThan(10);
  });

  it('creates passwordResetToken in DB on success', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    await svc.verifyCode(CODE_REQUEST);
    expect(prisma.passwordResetToken.create).toHaveBeenCalledTimes(1);
  });

  it('marks phonePasswordResetToken as used and COMPLETED on success', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    await svc.verifyCode(CODE_REQUEST);
    expect(prisma.phonePasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ verificationStep: 'COMPLETED' }),
      })
    );
  });

  it('trims whitespace from code before comparison', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    const result = await svc.verifyCode({ ...CODE_REQUEST, code: '  123456  ' });
    expect(result.success).toBe(true);
  });

  it('returns internal_error on unexpected exception', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockRejectedValue(new Error('crash')) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.verifyCode(CODE_REQUEST)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// resendCode
// ---------------------------------------------------------------------------
describe('PhonePasswordResetService — resendCode', () => {
  afterEach(() => jest.clearAllMocks());

  const CODE_TOKEN = () => makeToken({ verificationStep: 'CODE_PENDING' });

  it('returns invalid_token when token is not found', async () => {
    const svc = new PhonePasswordResetService(makePrisma(), makeCache(), makeSms(), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'invalid_token' });
  });

  it('returns invalid_token when token is revoked', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue({ ...CODE_TOKEN(), isRevoked: true }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'invalid_token' });
  });

  it('returns invalid_step when not in CODE_PENDING step', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(makeToken({ verificationStep: 'IDENTITY_PENDING' })) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'invalid_step' });
  });

  it('returns rate_limited when resend key exists in cache', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const cache = makeCache('1'); // key is set → rate limited
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'rate_limited' });
  });

  it('returns sms_send_failed when SMS delivery fails', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(null), makeSms(false), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'sms_send_failed' });
  });

  it('returns success and sets resend rate limit key', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue(CODE_TOKEN()) },
    });
    const cache = makeCache(null);
    const svc = new PhonePasswordResetService(prisma, cache, makeSms(true), makeGeo());

    const result = await svc.resendCode('tok_001', '1.2.3.4');

    expect(result).toEqual({ success: true });
    expect(cache.set).toHaveBeenCalledWith(expect.stringContaining('tok_001'), '1', 60);
  });

  it('resets codeAttempts to 0 on resend', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockResolvedValue({ ...CODE_TOKEN(), codeAttempts: 3 }) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(null), makeSms(true), makeGeo());

    await svc.resendCode('tok_001', '1.2.3.4');

    expect(prisma.phonePasswordResetToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ codeAttempts: 0 }) })
    );
  });

  it('returns internal_error on unexpected exception', async () => {
    const prisma = makePrisma({
      phoneTokenFindUnique: { findUnique: jest.fn().mockRejectedValue(new Error('crash')) },
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    expect(await svc.resendCode('tok_001', '1.2.3.4')).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// transferPhone
// ---------------------------------------------------------------------------
describe('PhonePasswordResetService — transferPhone', () => {
  afterEach(() => jest.clearAllMocks());

  const TRANSFER_REQUEST = {
    fromUserId: 'user_old',
    toUserId: 'user_new',
    phoneNumber: '+15550001234',
    phoneCountryCode: 'US',
    ipAddress: '1.2.3.4',
  };

  it('runs atomically via $transaction', async () => {
    const prisma = makePrisma();
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    await svc.transferPhone(TRANSFER_REQUEST);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('returns success:true on happy path', async () => {
    const svc = new PhonePasswordResetService(makePrisma(), makeCache(), makeSms(), makeGeo());
    const result = await svc.transferPhone(TRANSFER_REQUEST);
    expect(result).toEqual({ success: true });
  });

  it('clears phone fields on the source user', async () => {
    let capturedTx: Record<string, jest.Mock> | null = null;
    const prisma = makePrisma({
      transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue({}) },
          securityEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        capturedTx = tx as unknown as Record<string, jest.Mock>;
        return fn(tx);
      }),
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    await svc.transferPhone(TRANSFER_REQUEST);

    const userUpdates = (capturedTx!['user'] as any).update.mock.calls;
    const clearCall = userUpdates.find((c: unknown[]) =>
      (c[0] as { where: { id: string } }).where.id === 'user_old'
    );
    expect(clearCall[0].data.phoneNumber).toBeNull();
    expect(clearCall[0].data.phoneVerifiedAt).toBeNull();
  });

  it('sets phone fields on the destination user', async () => {
    let capturedTx: Record<string, jest.Mock> | null = null;
    const prisma = makePrisma({
      transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
        const tx = {
          user: { update: jest.fn().mockResolvedValue({}) },
          securityEvent: { create: jest.fn().mockResolvedValue({}) },
        };
        capturedTx = tx as unknown as Record<string, jest.Mock>;
        return fn(tx);
      }),
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());

    await svc.transferPhone(TRANSFER_REQUEST);

    const userUpdates = (capturedTx!['user'] as any).update.mock.calls;
    const setCall = userUpdates.find((c: unknown[]) =>
      (c[0] as { where: { id: string } }).where.id === 'user_new'
    );
    expect(setCall[0].data.phoneNumber).toBe('+15550001234');
    expect(setCall[0].data.phoneTransferredFromUserId).toBe('user_old');
  });

  it('returns internal_error when transaction throws', async () => {
    const prisma = makePrisma({
      transaction: jest.fn().mockRejectedValue(new Error('Transaction failed')),
    });
    const svc = new PhonePasswordResetService(prisma, makeCache(), makeSms(), makeGeo());
    const result = await svc.transferPhone(TRANSFER_REQUEST);
    expect(result).toEqual({ success: false, error: 'internal_error' });
  });
});
