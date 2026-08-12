/**
 * Unit tests for PhoneTransferService.
 * Covers: checkPhoneOwnership (not found, not verified, verified owner),
 * initiateTransfer (no owner, SMS fail, happy path, DB error),
 * verifyAndTransfer (expired, max attempts, invalid code, valid code, DB error),
 * cancelTransfer, resendCode (expired, rate limited, SMS fail, happy path),
 * initiateTransferForRegistration (no owner, SMS fail, happy path),
 * verifyForRegistration (expired, wrong type, max attempts, invalid code, valid code),
 * executeRegistrationTransfer (invalid token, expired, not verified, happy path),
 * getTransferDataByToken (invalid token, expired, not verified, valid).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import crypto from 'crypto';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

import { PhoneTransferService } from '../../../services/PhoneTransferService';

// ─── Factories ────────────────────────────────────────────────────────────────

const OWNER = {
  id: 'owner-1',
  displayName: 'Jean Dupont',
  username: 'jdupont',
  email: 'jean@example.com',
  phoneVerifiedAt: new Date('2025-01-01'),
};

function makePrisma(overrides: {
  owner?: any;
} = {}) {
  const { owner = OWNER } = overrides;

  const txClient = {
    user: { update: jest.fn<any>().mockResolvedValue({}) },
    securityEvent: { create: jest.fn<any>().mockResolvedValue({}) },
  };

  return {
    user: {
      findFirst: jest.fn<any>().mockResolvedValue(owner),
    },
    securityEvent: {
      create: jest.fn<any>().mockResolvedValue({}),
    },
    $transaction: jest.fn<any>().mockImplementation(async (fn: any) => fn(txClient)),
    _txClient: txClient,
  };
}

function makeCache(initialData: Record<string, string | null> = {}) {
  const store: Record<string, string | null> = { ...initialData };
  return {
    get: jest.fn<any>().mockImplementation(async (key: string) => store[key] ?? null),
    set: jest.fn<any>().mockImplementation(async (key: string, value: string) => {
      store[key] = value;
    }),
    del: jest.fn<any>().mockImplementation(async (key: string) => {
      delete store[key];
    }),
    _store: store,
  };
}

function makeSms(success = true) {
  return {
    sendPasswordResetCode: jest.fn<any>().mockResolvedValue({ success }),
  };
}

function makeSut(overrides: {
  owner?: any;
  cacheData?: Record<string, string | null>;
  smsSuccess?: boolean;
} = {}) {
  const prisma = makePrisma({ owner: overrides.owner });
  const cache = makeCache(overrides.cacheData ?? {});
  const sms = makeSms(overrides.smsSuccess ?? true);
  const sut = new PhoneTransferService(prisma as any, cache as any, sms as any);
  return { sut, prisma, cache, sms };
}

function makeTransferData(overrides: Record<string, any> = {}) {
  const code = '123456';
  const codeHash = crypto.createHash('sha256').update(code).digest('hex');
  return {
    fromUserId: 'owner-1',
    toUserId: 'new-user-1',
    phoneNumber: '+33612345678',
    phoneCountryCode: '+33',
    codeHash,
    attempts: 0,
    createdAt: Date.now(),
    ipAddress: '1.2.3.4',
    userAgent: 'jest-test',
    _code: code,
    ...overrides,
  };
}

// ─── checkPhoneOwnership ──────────────────────────────────────────────────────

describe('checkPhoneOwnership', () => {
  it('returns exists:false when no user owns the phone number', async () => {
    const { sut } = makeSut({ owner: null });

    const result = await sut.checkPhoneOwnership('+33612345678');

    expect(result.exists).toBe(false);
  });

  it('returns exists:false when the owner has not verified their phone', async () => {
    const unverified = { ...OWNER, phoneVerifiedAt: null };
    const { sut } = makeSut({ owner: unverified });

    const result = await sut.checkPhoneOwnership('+33612345678');

    expect(result.exists).toBe(false);
  });

  it('returns exists:true with masked owner info for a verified owner', async () => {
    const { sut } = makeSut();

    const result = await sut.checkPhoneOwnership('+33612345678');

    expect(result.exists).toBe(true);
    expect(result.ownerId).toBe('owner-1');
    expect(result.maskedInfo).toBeDefined();
    expect(typeof result.maskedInfo!.displayName).toBe('string');
    expect(typeof result.maskedInfo!.username).toBe('string');
    expect(typeof result.maskedInfo!.email).toBe('string');
  });
});

// ─── initiateTransfer ────────────────────────────────────────────────────────

describe('initiateTransfer', () => {
  const REQ = {
    phoneNumber: '+33612345678',
    phoneCountryCode: '+33',
    newUserId: 'new-user-1',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('returns phone_not_found when no verified owner exists', async () => {
    const { sut } = makeSut({ owner: null });

    const result = await sut.initiateTransfer(REQ);

    expect(result.success).toBe(false);
    expect(result.error).toBe('phone_not_found');
  });

  it('returns sms_send_failed and cleans up cache when SMS fails', async () => {
    const { sut, cache } = makeSut({ smsSuccess: false });

    const result = await sut.initiateTransfer(REQ);

    expect(result.success).toBe(false);
    expect(result.error).toBe('sms_send_failed');
    expect(cache.del).toHaveBeenCalled();
  });

  it('returns success:true with transferId and masked owner info on happy path', async () => {
    const { sut } = makeSut();

    const result = await sut.initiateTransfer(REQ);

    expect(result.success).toBe(true);
    expect(typeof result.transferId).toBe('string');
    expect(result.maskedOwnerInfo).toBeDefined();
    expect(typeof result.maskedOwnerInfo!.email).toBe('string');
  });

  it('stores transfer data in cache with expiry', async () => {
    const { sut, cache } = makeSut();

    await sut.initiateTransfer(REQ);

    expect(cache.set).toHaveBeenCalledWith(
      expect.stringContaining('phone-transfer:'),
      expect.any(String),
      600 // 10 * 60
    );
  });

  it('returns internal_error on DB exception', async () => {
    const { sut, prisma } = makeSut();
    (prisma.user.findFirst as jest.Mock<any>).mockRejectedValue(new Error('DB down'));

    const result = await sut.initiateTransfer(REQ);

    expect(result.success).toBe(false);
    expect(result.error).toBe('internal_error');
  });
});

// ─── verifyAndTransfer ───────────────────────────────────────────────────────

describe('verifyAndTransfer', () => {
  it('returns transfer_expired when cache has no matching entry', async () => {
    const { sut } = makeSut({ cacheData: {} });

    const result = await sut.verifyAndTransfer({ transferId: 'bad-id', code: '123456', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('transfer_expired');
  });

  it('returns max_attempts_exceeded and deletes cache entry when attempts >= 5', async () => {
    const td = makeTransferData({ attempts: 5 });
    const { _code, ...data } = td;
    const { sut, cache } = makeSut({ cacheData: { 'phone-transfer:xfer-1': JSON.stringify(data) } });

    const result = await sut.verifyAndTransfer({ transferId: 'xfer-1', code: '123456', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_attempts_exceeded');
    expect(cache.del).toHaveBeenCalledWith('phone-transfer:xfer-1');
  });

  it('returns invalid_code and increments attempts when code is wrong', async () => {
    const td = makeTransferData({ attempts: 0 });
    const { _code, ...data } = td;
    const { sut, cache } = makeSut({ cacheData: { 'phone-transfer:xfer-2': JSON.stringify(data) } });

    const result = await sut.verifyAndTransfer({ transferId: 'xfer-2', code: 'WRONG_CODE', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_code');
    expect(cache.set).toHaveBeenCalled();
    const updatedData = JSON.parse((cache as any)._store['phone-transfer:xfer-2']);
    expect(updatedData.attempts).toBe(1);
  });

  it('executes atomic transfer transaction and cleans up cache on valid code', async () => {
    const td = makeTransferData({ attempts: 0 });
    const { _code, ...data } = td;
    const { sut, prisma, cache } = makeSut({ cacheData: { 'phone-transfer:xfer-3': JSON.stringify(data) } });

    const result = await sut.verifyAndTransfer({ transferId: 'xfer-3', code: td._code, ipAddress: '1.2.3.4' });

    expect(result.success).toBe(true);
    expect(result.transferred).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('phone-transfer:xfer-3');
  });

  it('returns internal_error on DB exception during transaction', async () => {
    const td = makeTransferData({ attempts: 0 });
    const { _code, ...data } = td;
    const { sut, prisma, cache: _cache } = makeSut({ cacheData: { 'phone-transfer:xfer-4': JSON.stringify(data) } });
    (prisma.$transaction as jest.Mock<any>).mockRejectedValue(new Error('DB crash'));

    const result = await sut.verifyAndTransfer({ transferId: 'xfer-4', code: td._code, ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('internal_error');
  });
});

// ─── cancelTransfer ──────────────────────────────────────────────────────────

describe('cancelTransfer', () => {
  it('deletes the cache entry for the given transferId', async () => {
    const { sut, cache } = makeSut({ cacheData: { 'phone-transfer:xfer-99': 'data' } });

    await sut.cancelTransfer('xfer-99');

    expect(cache.del).toHaveBeenCalledWith('phone-transfer:xfer-99');
  });
});

// ─── resendCode ──────────────────────────────────────────────────────────────

describe('resendCode', () => {
  it('returns transfer_expired when cache has no entry for the transferId', async () => {
    const { sut } = makeSut({ cacheData: {} });

    const result = await sut.resendCode('xfer-gone', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('transfer_expired');
  });

  it('returns rate_limited when a resend cooldown entry exists in cache', async () => {
    const td = makeTransferData();
    const { _code, ...data } = td;
    const { sut } = makeSut({
      cacheData: {
        'phone-transfer:xfer-rl': JSON.stringify(data),
        'ratelimit:phone-transfer:resend:xfer-rl': '1',
      },
    });

    const result = await sut.resendCode('xfer-rl', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('rate_limited');
  });

  it('returns sms_send_failed when SMS service fails', async () => {
    const td = makeTransferData();
    const { _code, ...data } = td;
    const { sut } = makeSut({
      cacheData: { 'phone-transfer:xfer-sms': JSON.stringify(data) },
      smsSuccess: false,
    });

    const result = await sut.resendCode('xfer-sms', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('sms_send_failed');
  });

  it('updates the code hash and sets the rate limit on success', async () => {
    const td = makeTransferData();
    const { _code, ...data } = td;
    const { sut, cache, sms } = makeSut({
      cacheData: { 'phone-transfer:xfer-ok': JSON.stringify(data) },
    });

    const result = await sut.resendCode('xfer-ok', '1.2.3.4');

    expect(result.success).toBe(true);
    expect(sms.sendPasswordResetCode).toHaveBeenCalled();
    // Rate limit key should have been set
    expect(cache.set).toHaveBeenCalledWith(
      'ratelimit:phone-transfer:resend:xfer-ok',
      '1',
      60
    );
  });
});

// ─── initiateTransferForRegistration ─────────────────────────────────────────

describe('initiateTransferForRegistration', () => {
  const REG_REQ = {
    phoneNumber: '+33612345678',
    phoneCountryCode: '+33',
    pendingUsername: 'newuser',
    pendingEmail: 'new@example.com',
    ipAddress: '1.2.3.4',
    userAgent: 'jest',
  };

  it('returns phone_not_found when no verified owner exists', async () => {
    const { sut } = makeSut({ owner: null });

    const result = await sut.initiateTransferForRegistration(REG_REQ);

    expect(result.success).toBe(false);
    expect(result.error).toBe('phone_not_found');
  });

  it('returns sms_send_failed and cleans up cache when SMS fails', async () => {
    const { sut, cache } = makeSut({ smsSuccess: false });

    const result = await sut.initiateTransferForRegistration(REG_REQ);

    expect(result.success).toBe(false);
    expect(result.error).toBe('sms_send_failed');
    expect(cache.del).toHaveBeenCalled();
  });

  it('returns success:true with transferId on happy path', async () => {
    const { sut, cache } = makeSut();

    const result = await sut.initiateTransferForRegistration(REG_REQ);

    expect(result.success).toBe(true);
    expect(typeof result.transferId).toBe('string');
    // Stores registration-type data
    const storedKey = Object.keys((cache as any)._store).find((k) =>
      k.startsWith('phone-transfer:')
    );
    expect(storedKey).toBeDefined();
    const stored = JSON.parse((cache as any)._store[storedKey!]);
    expect(stored.type).toBe('registration');
    expect(stored.pendingUsername).toBe('newuser');
  });
});

// ─── verifyForRegistration ────────────────────────────────────────────────────

describe('verifyForRegistration', () => {
  it('returns transfer_expired when cache has no entry', async () => {
    const { sut } = makeSut({ cacheData: {} });

    const result = await sut.verifyForRegistration({ transferId: 'gone', code: '111111', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('transfer_expired');
  });

  it('returns invalid_transfer_type when stored data is not registration type', async () => {
    const td = { ...makeTransferData(), type: 'account' };
    const { _code, ...data } = td;
    const { sut } = makeSut({ cacheData: { 'phone-transfer:vr-1': JSON.stringify(data) } });

    const result = await sut.verifyForRegistration({ transferId: 'vr-1', code: td._code, ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transfer_type');
  });

  it('returns max_attempts_exceeded when attempts >= 5', async () => {
    const td = { ...makeTransferData({ attempts: 5 }), type: 'registration' };
    const { _code, ...data } = td;
    const { sut } = makeSut({ cacheData: { 'phone-transfer:vr-2': JSON.stringify(data) } });

    const result = await sut.verifyForRegistration({ transferId: 'vr-2', code: '000000', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('max_attempts_exceeded');
  });

  it('returns invalid_code and increments attempts on wrong code', async () => {
    const td = { ...makeTransferData({ attempts: 0 }), type: 'registration' };
    const { _code, ...data } = td;
    const { sut, cache } = makeSut({ cacheData: { 'phone-transfer:vr-3': JSON.stringify(data) } });

    const result = await sut.verifyForRegistration({ transferId: 'vr-3', code: 'WRONGG', ipAddress: '1.2.3.4' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_code');
    const stored = JSON.parse((cache as any)._store['phone-transfer:vr-3']);
    expect(stored.attempts).toBe(1);
  });

  it('returns success:true with a transferToken on valid code', async () => {
    const td = { ...makeTransferData({ attempts: 0 }), type: 'registration' };
    const { _code, ...data } = td;
    const { sut } = makeSut({ cacheData: { 'phone-transfer:vr-4': JSON.stringify(data) } });

    const result = await sut.verifyForRegistration({ transferId: 'vr-4', code: td._code, ipAddress: '1.2.3.4' });

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(typeof result.transferToken).toBe('string');
    expect(result.transferToken!.length).toBeGreaterThan(0);
  });
});

// ─── executeRegistrationTransfer ─────────────────────────────────────────────

describe('executeRegistrationTransfer', () => {
  it('returns invalid_transfer_token when no token→transferId mapping exists', async () => {
    const { sut } = makeSut({ cacheData: {} });

    const result = await sut.executeRegistrationTransfer('fake-token', 'new-user', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transfer_token');
  });

  it('returns transfer_expired when transfer data no longer exists in cache', async () => {
    const fakeToken = 'raw-token-value';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const { sut } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-ghost',
        // no 'phone-transfer:xfer-ghost' entry
      },
    });

    const result = await sut.executeRegistrationTransfer(fakeToken, 'new-user', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('transfer_expired');
  });

  it('returns invalid_transfer_token when transfer is not verified', async () => {
    const fakeToken = 'raw-token-not-verified';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const td = { ...makeTransferData(), type: 'registration', verified: false, transferTokenHash: tokenHash };
    const { _code, ...data } = td;
    const { sut } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-nv',
        'phone-transfer:xfer-nv': JSON.stringify(data),
      },
    });

    const result = await sut.executeRegistrationTransfer(fakeToken, 'new-user', '1.2.3.4');

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_transfer_token');
  });

  it('executes transfer atomically and cleans up both cache keys on happy path', async () => {
    const fakeToken = 'valid-raw-token';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const td = {
      ...makeTransferData(),
      type: 'registration',
      verified: true,
      transferTokenHash: tokenHash,
    };
    const { _code, ...data } = td;
    const { sut, prisma, cache } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-happy',
        'phone-transfer:xfer-happy': JSON.stringify(data),
      },
    });

    const result = await sut.executeRegistrationTransfer(fakeToken, 'new-user', '1.2.3.4');

    expect(result.success).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(cache.del).toHaveBeenCalledWith('phone-transfer:xfer-happy');
    expect(cache.del).toHaveBeenCalledWith(`phone-transfer-token:${tokenHash}`);
  });
});

// ─── getTransferDataByToken ───────────────────────────────────────────────────

describe('getTransferDataByToken', () => {
  it('returns valid:false when no token mapping exists in cache', async () => {
    const { sut } = makeSut({ cacheData: {} });

    const result = await sut.getTransferDataByToken('ghost-token');

    expect(result.valid).toBe(false);
  });

  it('returns valid:false when transfer data expired from cache', async () => {
    const fakeToken = 'my-token';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const { sut } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-expired',
        // no phone-transfer:xfer-expired
      },
    });

    const result = await sut.getTransferDataByToken(fakeToken);

    expect(result.valid).toBe(false);
  });

  it('returns valid:false when transfer is not marked as verified', async () => {
    const fakeToken = 'unverified-token';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const data = { verified: false, transferTokenHash: tokenHash, phoneNumber: '+1', phoneCountryCode: '+1', fromUserId: 'old' };
    const { sut } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-unv',
        'phone-transfer:xfer-unv': JSON.stringify(data),
      },
    });

    const result = await sut.getTransferDataByToken(fakeToken);

    expect(result.valid).toBe(false);
  });

  it('returns valid:true with phoneNumber and fromUserId when verified', async () => {
    const fakeToken = 'verified-token';
    const tokenHash = crypto.createHash('sha256').update(fakeToken).digest('hex');
    const data = {
      verified: true,
      transferTokenHash: tokenHash,
      phoneNumber: '+33612345678',
      phoneCountryCode: '+33',
      fromUserId: 'old-user-1',
    };
    const { sut } = makeSut({
      cacheData: {
        [`phone-transfer-token:${tokenHash}`]: 'xfer-v',
        'phone-transfer:xfer-v': JSON.stringify(data),
      },
    });

    const result = await sut.getTransferDataByToken(fakeToken);

    expect(result.valid).toBe(true);
    expect(result.phoneNumber).toBe('+33612345678');
    expect(result.phoneCountryCode).toBe('+33');
    expect(result.fromUserId).toBe('old-user-1');
  });
});
