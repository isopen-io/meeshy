/**
 * Unit tests for PhonePasswordResetService
 * Covers:
 *   - maskEmail, maskUsername, maskDisplayName pure helpers (security-critical)
 *   - lookupByPhone: rate-limited, invalid phone, user not found,
 *     phone not verified, happy path
 *   - verifyIdentity: token not found, revoked, expired, wrong step,
 *     max attempts, identity mismatch, SMS failure, happy path
 *   - verifyCode: token not found, revoked, expired, wrong step,
 *     max attempts, wrong code, happy path
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('../../../utils/normalize', () => ({
  normalizePhoneWithCountry: jest.fn<any>().mockReturnValue({ isValid: true, phoneNumber: '+33612345678' }),
}));

import {
  PhonePasswordResetService,
  maskEmail,
  maskUsername,
  maskDisplayName,
} from '../../../services/PhonePasswordResetService';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const { normalizePhoneWithCountry } = require('../../../utils/normalize');

// ─── Masking helpers (pure functions) ────────────────────────────────────────

describe('maskEmail', () => {
  it('masks normal email with long local part', () => {
    expect(maskEmail('jean@facebook.com')).toBe('je....n@f*****om');
  });

  it('masks email with short local part (≤ 3 chars)', () => {
    const result = maskEmail('ab@test.com');
    expect(result).toMatch(/^a\*+@/);
  });

  it('returns fallback for missing @ sign', () => {
    expect(maskEmail('invalid')).toBe('***@***.***');
  });

  it('returns fallback for empty string', () => {
    expect(maskEmail('')).toBe('***@***.***');
  });

  it('handles multi-part TLD correctly', () => {
    const result = maskEmail('user@company.co.uk');
    expect(result).toContain('@');
    expect(result).not.toContain('company');
  });
});

describe('maskUsername', () => {
  it('masks normal username (first + stars + last)', () => {
    expect(maskUsername('toto2025')).toBe('t******5');
  });

  it('masks short username (2 chars)', () => {
    const result = maskUsername('ab');
    expect(result).toBe('a*');
  });

  it('masks single char', () => {
    const result = maskUsername('x');
    expect(result).toBe('x*');
  });

  it('returns default mask for empty string', () => {
    expect(maskUsername('')).toBe('********');
  });

  it('caps middle stars at 6 for very long usernames', () => {
    const result = maskUsername('verylongusername');
    expect(result).toMatch(/^v\*{6}e$/);
  });
});

describe('maskDisplayName', () => {
  it('masks each word: first + stars + last', () => {
    expect(maskDisplayName('John Doe')).toBe('J**n D*e');
  });

  it('returns default for null/undefined', () => {
    expect(maskDisplayName(null)).toBe('*** ***');
    expect(maskDisplayName(undefined)).toBe('*** ***');
  });

  it('handles single-word name', () => {
    const result = maskDisplayName('Alice');
    expect(result).toMatch(/^A\*+e$/);
  });

  it('handles two-char word', () => {
    const result = maskDisplayName('Al');
    expect(result).toBe('A*');
  });

  it('trims leading/trailing whitespace', () => {
    const result = maskDisplayName('  Bob  ');
    expect(result).toMatch(/B/);
  });
});

// ─── Factories ───────────────────────────────────────────────────────────────

const NOW = new Date();
const FUTURE = new Date(Date.now() + 60 * 60 * 1000);
const PAST = new Date(Date.now() - 60 * 60 * 1000);

function makeUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-1',
    username: 'alice2025',
    email: 'alice@example.com',
    displayName: 'Alice Smith',
    avatar: null,
    phoneVerifiedAt: NOW,
    ...overrides,
  };
}

function makeToken(overrides: Record<string, any> = {}) {
  return {
    id: 'token-1',
    userId: 'user-1',
    isRevoked: false,
    usedAt: null,
    expiresAt: FUTURE,
    verificationStep: 'IDENTITY_PENDING',
    identityAttempts: 0,
    codeAttempts: 0,
    codeHash: '',
    user: {
      id: 'user-1',
      username: 'alice2025',
      email: 'alice@example.com',
      phoneNumber: '+33612345678',
      firstName: 'Alice',
      lastName: 'Smith',
    },
    ...overrides,
  };
}

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(makeUser()),
    },
    phonePasswordResetToken: {
      create: jest.fn<any>().mockResolvedValue({ id: 'token-1' }),
      findUnique: jest.fn<any>().mockResolvedValue(makeToken()),
      update: jest.fn<any>().mockResolvedValue({}),
    },
    passwordResetToken: {
      create: jest.fn<any>().mockResolvedValue({ id: 'prt-1' }),
    },
    securityEvent: {
      create: jest.fn<any>().mockResolvedValue({}),
    },
    ...overrides,
  } as unknown as PrismaClient;
}

function makeCache() {
  return {
    get: jest.fn<any>().mockResolvedValue(null),
    set: jest.fn<any>().mockResolvedValue(undefined),
    incr: jest.fn<any>().mockResolvedValue(1),
    expire: jest.fn<any>().mockResolvedValue(undefined),
  } as any;
}

function makeSmsService(success = true) {
  return {
    sendPasswordResetCode: jest.fn<any>().mockResolvedValue({ success, provider: 'twilio' }),
  } as any;
}

function makeGeoIPService() {
  return {
    lookup: jest.fn<any>().mockResolvedValue({ location: 'Paris, FR' }),
  } as any;
}

function makeSut(options: { prisma?: any; cache?: any; sms?: any; geo?: any } = {}) {
  return new PhonePasswordResetService(
    options.prisma ?? makePrisma(),
    options.cache ?? makeCache(),
    options.sms ?? makeSmsService(),
    options.geo ?? makeGeoIPService()
  );
}

const BASE_LOOKUP = {
  phoneNumber: '+33612345678',
  countryCode: 'FR',
  ipAddress: '1.2.3.4',
  userAgent: 'test',
};

const BASE_IDENTITY = {
  tokenId: 'token-1',
  fullUsername: 'alice2025',
  fullEmail: 'alice@example.com',
  ipAddress: '1.2.3.4',
  userAgent: 'test',
};

const BASE_CODE = {
  tokenId: 'token-1',
  code: '123456',
  ipAddress: '1.2.3.4',
  userAgent: 'test',
};

// ─── lookupByPhone ────────────────────────────────────────────────────────────

describe('PhonePasswordResetService.lookupByPhone', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    normalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678' });
  });

  it('returns rate_limited when cache count exceeds limit', async () => {
    const cache = makeCache();
    cache.get = jest.fn<any>().mockResolvedValue('10'); // > limit
    const sut = makeSut({ cache });

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(false);
    expect(result.error).toBe('rate_limited');
  });

  it('returns invalid_phone when normalizer returns invalid', async () => {
    normalizePhoneWithCountry.mockReturnValue({ isValid: false });
    const sut = makeSut();

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_phone');
  });

  it('returns user_not_found when no user found', async () => {
    const prisma = makePrisma();
    (prisma.user.findFirst as jest.Mock<any>).mockResolvedValue(null);
    const sut = makeSut({ prisma });

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(false);
    expect(result.error).toBe('user_not_found');
  });

  it('returns phone_not_verified when user has no phoneVerifiedAt', async () => {
    const prisma = makePrisma();
    (prisma.user.findFirst as jest.Mock<any>).mockResolvedValue(makeUser({ phoneVerifiedAt: null }));
    const sut = makeSut({ prisma });

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(false);
    expect(result.error).toBe('phone_not_verified');
  });

  it('returns masked user info on happy path', async () => {
    const sut = makeSut();

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(true);
    expect(result.tokenId).toBe('token-1');
    expect(result.maskedUserInfo?.username).not.toContain('alice2025');
    expect(result.maskedUserInfo?.email).not.toContain('alice@example.com');
  });

  it('returns internal_error on unexpected exception', async () => {
    const prisma = makePrisma();
    (prisma.user.findFirst as jest.Mock<any>).mockRejectedValue(new Error('db crash'));
    const sut = makeSut({ prisma });

    const result = await sut.lookupByPhone(BASE_LOOKUP);

    expect(result.success).toBe(false);
    expect(result.error).toBe('internal_error');
  });
});

// ─── verifyIdentity ───────────────────────────────────────────────────────────

describe('PhonePasswordResetService.verifyIdentity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns invalid_token when token not found', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(null);
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_token');
  });

  it('returns token_expired for revoked token', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeToken({ isRevoked: true })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.error).toBe('token_expired');
  });

  it('returns token_expired when token has passed expiresAt', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeToken({ expiresAt: PAST })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.error).toBe('token_expired');
  });

  it('returns invalid_step when token is not in IDENTITY_PENDING step', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeToken({ verificationStep: 'CODE_PENDING' })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.error).toBe('invalid_step');
  });

  it('returns max_attempts_exceeded when identityAttempts >= 3', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeToken({ identityAttempts: 3 })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.error).toBe('max_attempts_exceeded');
  });

  it('returns identity_mismatch and attemptsRemaining when credentials wrong', async () => {
    const sut = makeSut();

    const result = await sut.verifyIdentity({
      ...BASE_IDENTITY,
      fullUsername: 'wrong',
      fullEmail: 'wrong@wrong.com',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('identity_mismatch');
    expect(result.attemptsRemaining).toBeDefined();
  });

  it('returns sms_send_failed when SMS service fails', async () => {
    const sut = makeSut({ sms: makeSmsService(false) });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.success).toBe(false);
    expect(result.error).toBe('sms_send_failed');
  });

  it('returns codeSent: true on happy path', async () => {
    const sut = makeSut();

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.success).toBe(true);
    expect(result.codeSent).toBe(true);
  });

  it('returns internal_error on unexpected exception', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockRejectedValue(
      new Error('db crash')
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyIdentity(BASE_IDENTITY);

    expect(result.success).toBe(false);
    expect(result.error).toBe('internal_error');
  });
});

// ─── verifyCode ───────────────────────────────────────────────────────────────

describe('PhonePasswordResetService.verifyCode', () => {
  const VALID_CODE = '654321';
  const CODE_HASH = require('crypto').createHash('sha256').update(VALID_CODE).digest('hex');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function makeCodeReadyToken(overrides: Record<string, any> = {}) {
    return makeToken({
      verificationStep: 'CODE_PENDING',
      codeHash: CODE_HASH,
      ...overrides,
    });
  }

  it('returns invalid_token when token not found', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(null);
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode(BASE_CODE);

    expect(result.error).toBe('invalid_token');
  });

  it('returns token_expired for revoked token', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeCodeReadyToken({ isRevoked: true })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode(BASE_CODE);

    expect(result.error).toBe('token_expired');
  });

  it('returns code_expired when expiresAt passed', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeCodeReadyToken({ expiresAt: PAST })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode(BASE_CODE);

    expect(result.error).toBe('code_expired');
  });

  it('returns invalid_step when token not in CODE_PENDING step', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeToken({ verificationStep: 'IDENTITY_PENDING' })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode(BASE_CODE);

    expect(result.error).toBe('invalid_step');
  });

  it('returns max_attempts_exceeded when codeAttempts >= 5', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeCodeReadyToken({ codeAttempts: 5 })
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode(BASE_CODE);

    expect(result.error).toBe('max_attempts_exceeded');
  });

  it('returns invalid_code for wrong code', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeCodeReadyToken()
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode({ ...BASE_CODE, code: 'WRONG1' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('code');
  });

  it('returns resetToken on correct code', async () => {
    const prisma = makePrisma();
    (prisma.phonePasswordResetToken.findUnique as jest.Mock<any>).mockResolvedValue(
      makeCodeReadyToken()
    );
    const sut = makeSut({ prisma });

    const result = await sut.verifyCode({ ...BASE_CODE, code: VALID_CODE });

    expect(result.success).toBe(true);
    expect(result.resetToken).toBeDefined();
    expect(typeof result.resetToken).toBe('string');
  });
});
