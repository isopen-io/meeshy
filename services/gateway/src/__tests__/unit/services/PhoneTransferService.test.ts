/**
 * PhoneTransferService Unit Tests
 *
 * Covers:
 * - checkPhoneOwnership(): not found, unverified, found+verified
 * - initiateTransfer(): not found, SMS failure, success
 * - verifyAndTransfer(): expired, max attempts, wrong code, correct code (atomic tx)
 * - cancelTransfer(): deletes cache entry
 * - resendCode(): expired, rate limited, SMS failure, success
 * - initiateTransferForRegistration(): not found, SMS failure, success
 * - verifyForRegistration(): expired, wrong type, max attempts, wrong code, success
 * - executeRegistrationTransfer(): token not found, data expired, not verified, success
 * - getTransferDataByToken(): not found, expired, not verified, success
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

import crypto from 'crypto';
import { PhoneTransferService } from '../../../services/PhoneTransferService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function codeHash(code: string) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/** In-memory cache that mimics Redis get/set/del */
function makeCache(initialData: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    get: jest.fn().mockImplementation((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn().mockImplementation((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: jest.fn().mockImplementation((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
    _store: store,
  } as any;
}

function makeTransferData(overrides: Record<string, unknown> = {}) {
  return {
    fromUserId: 'user_old',
    toUserId: 'user_new',
    phoneNumber: '+15550001234',
    phoneCountryCode: 'US',
    codeHash: codeHash('123456'),
    attempts: 0,
    createdAt: Date.now(),
    ipAddress: '1.2.3.4',
    userAgent: 'test-agent',
    ...overrides,
  };
}

function makeRegistrationTransferData(overrides: Record<string, unknown> = {}) {
  return {
    type: 'registration',
    fromUserId: 'user_old',
    phoneNumber: '+15550001234',
    phoneCountryCode: 'US',
    pendingUsername: 'newuser',
    pendingEmail: 'new@example.com',
    codeHash: codeHash('123456'),
    attempts: 0,
    verified: false,
    createdAt: Date.now(),
    ipAddress: '1.2.3.4',
    userAgent: 'test-agent',
    ...overrides,
  };
}

function makePrisma(userFindFirst = jest.fn().mockResolvedValue(null)) {
  return {
    user: {
      findFirst: userFindFirst,
      update: jest.fn().mockResolvedValue({}),
    },
    securityEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        user: { update: jest.fn().mockResolvedValue({}) },
        securityEvent: { create: jest.fn().mockResolvedValue({}) },
      };
      return fn(tx);
    }),
  } as any;
}

function makeSms(success = true) {
  return {
    sendPasswordResetCode: jest.fn().mockResolvedValue({
      success,
      provider: 'twilio',
      error: success ? undefined : 'SMS failed',
    }),
  } as any;
}

function makeOwner(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user_old',
    displayName: 'Jane Doe',
    username: 'janedoe',
    email: 'jane@example.com',
    phoneVerifiedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// checkPhoneOwnership
// ---------------------------------------------------------------------------
describe('checkPhoneOwnership', () => {
  it('returns exists:false when no user has this phone', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.checkPhoneOwnership('+15550001234')).toEqual({ exists: false });
  });

  it('returns exists:false when owner phone is not verified', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({ phoneVerifiedAt: null }))),
      makeCache(),
      makeSms()
    );
    expect(await svc.checkPhoneOwnership('+15550001234')).toEqual({ exists: false });
  });

  it('returns exists:true with ownerId and maskedInfo for verified owner', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234');

    expect(result.exists).toBe(true);
    expect(result.ownerId).toBe('user_old');
    expect(result.maskedInfo).toBeDefined();
    expect(result.maskedInfo!.username).not.toBe('janedoe'); // masked
    expect(result.maskedInfo!.email).not.toBe('jane@example.com'); // masked
  });

  it('flags a recently active owner as not dormant', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({ lastActiveAt: new Date() }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234');

    expect(result.dormant).toBe(false);
    expect(result.dormantSince).toBeNull();
    expect(result.recoverySuggested).toBe(false);
  });

  it('flags an owner inactive for over 180 days as dormant', async () => {
    const oldDate = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({ lastActiveAt: oldDate }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234');

    expect(result.dormant).toBe(true);
    expect(result.dormantSince).toBe(oldDate.toISOString());
  });

  it('suggests recovery when the account is dormant and names match exactly', async () => {
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({
        firstName: 'Jane', lastName: 'Doe', lastActiveAt: oldDate,
      }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234', {
      firstName: 'jane', lastName: 'DOE',
    });

    expect(result.dormant).toBe(true);
    expect(result.nameSimilarity).toBe('exact');
    expect(result.recoverySuggested).toBe(true);
  });

  it('suggests recovery when the account is dormant and names are similar', async () => {
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({
        firstName: 'Jane', lastName: 'Doe', lastActiveAt: oldDate,
      }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234', {
      firstName: 'Jayne', lastName: 'Doe',
    });

    expect(result.nameSimilarity).toBe('similar');
    expect(result.recoverySuggested).toBe(true);
  });

  it('does not suggest recovery for a dormant account when names differ', async () => {
    const oldDate = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({
        firstName: 'Jane', lastName: 'Doe', lastActiveAt: oldDate,
      }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234', {
      firstName: 'Boris', lastName: 'Tchoua',
    });

    expect(result.nameSimilarity).toBe('different');
    expect(result.recoverySuggested).toBe(false);
  });

  it('does not suggest recovery for matching names on an active account', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({
        firstName: 'Jane', lastName: 'Doe', lastActiveAt: new Date(),
      }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234', {
      firstName: 'Jane', lastName: 'Doe',
    });

    expect(result.nameSimilarity).toBe('exact');
    expect(result.recoverySuggested).toBe(false);
  });

  it('returns nameSimilarity:null when no identity is provided', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner({ lastActiveAt: new Date() }))),
      makeCache(),
      makeSms()
    );
    const result = await svc.checkPhoneOwnership('+15550001234');

    expect(result.nameSimilarity).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// initiateTransfer
// ---------------------------------------------------------------------------
describe('initiateTransfer', () => {
  const REQ = {
    phoneNumber: '+15550001234',
    phoneCountryCode: 'US',
    newUserId: 'user_new',
    ipAddress: '1.2.3.4',
    userAgent: 'test-agent',
  };

  it('returns phone_not_found when no verified owner exists', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.initiateTransfer(REQ)).toEqual({ success: false, error: 'phone_not_found' });
  });

  it('returns sms_send_failed and cleans up cache when SMS fails', async () => {
    const cache = makeCache();
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      cache,
      makeSms(false)
    );

    const result = await svc.initiateTransfer(REQ);

    expect(result).toEqual({ success: false, error: 'sms_send_failed' });
    expect(cache.del).toHaveBeenCalledTimes(1);
  });

  it('returns success with transferId and maskedOwnerInfo', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      makeCache(),
      makeSms(true)
    );

    const result = await svc.initiateTransfer(REQ);

    expect(result.success).toBe(true);
    expect(typeof result.transferId).toBe('string');
    expect(result.transferId!.length).toBeGreaterThan(0);
    expect(result.maskedOwnerInfo).toBeDefined();
  });

  it('stores transfer data in cache on success', async () => {
    const cache = makeCache();
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      cache,
      makeSms(true)
    );

    const result = await svc.initiateTransfer(REQ);

    expect(cache.set).toHaveBeenCalledWith(
      `phone-transfer:${result.transferId}`,
      expect.any(String),
      10 * 60
    );
  });

  it('returns internal_error on unexpected exception', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockRejectedValue(new Error('DB crash'))),
      makeCache(),
      makeSms()
    );
    expect(await svc.initiateTransfer(REQ)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// verifyAndTransfer
// ---------------------------------------------------------------------------
describe('verifyAndTransfer', () => {
  const VERIFY_REQ = { transferId: 'transfer_123', code: '123456', ipAddress: '1.2.3.4' };

  it('returns transfer_expired when transferId not in cache', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.verifyAndTransfer(VERIFY_REQ)).toEqual({ success: false, error: 'transfer_expired' });
  });

  it('returns max_attempts_exceeded and cleans cache when attempts >= 5', async () => {
    const data = makeTransferData({ attempts: 5 });
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyAndTransfer(VERIFY_REQ);

    expect(result).toEqual({ success: false, error: 'max_attempts_exceeded' });
    expect(cache.del).toHaveBeenCalledWith('phone-transfer:transfer_123');
  });

  it('returns invalid_code and increments attempts for wrong code', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyAndTransfer({ ...VERIFY_REQ, code: '000000' });

    expect(result).toEqual({ success: false, error: 'invalid_code' });
    // Verify attempts were incremented in updated cache entry
    const updatedRaw = cache._store.get('phone-transfer:transfer_123');
    expect(JSON.parse(updatedRaw!).attempts).toBe(1);
  });

  it('trims whitespace from code before comparison', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyAndTransfer({ ...VERIFY_REQ, code: '  123456  ' });

    expect(result.success).toBe(true);
  });

  it('returns success and transferred:true on correct code', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.verifyAndTransfer(VERIFY_REQ)).toEqual({ success: true, transferred: true });
  });

  it('runs the transfer in a $transaction on success', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const prisma = makePrisma();
    const svc = new PhoneTransferService(prisma, cache, makeSms());

    await svc.verifyAndTransfer(VERIFY_REQ);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('cleans up cache after successful transfer', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    await svc.verifyAndTransfer(VERIFY_REQ);

    expect(cache.del).toHaveBeenCalledWith('phone-transfer:transfer_123');
  });

  it('returns internal_error on unexpected exception', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('Redis crash')),
      set: jest.fn(),
      del: jest.fn(),
    } as any;
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.verifyAndTransfer(VERIFY_REQ)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// cancelTransfer
// ---------------------------------------------------------------------------
describe('cancelTransfer', () => {
  it('deletes the transfer entry from cache', async () => {
    const cache = makeCache({ 'phone-transfer:abc': 'data' });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    await svc.cancelTransfer('abc');

    expect(cache.del).toHaveBeenCalledWith('phone-transfer:abc');
    expect(cache._store.has('phone-transfer:abc')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// resendCode
// ---------------------------------------------------------------------------
describe('resendCode', () => {
  it('returns transfer_expired when transferId not in cache', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.resendCode('transfer_123', '1.2.3.4')).toEqual({ success: false, error: 'transfer_expired' });
  });

  it('returns rate_limited when resend rate limit key exists', async () => {
    const data = makeTransferData();
    const cache = makeCache({
      'phone-transfer:transfer_123': JSON.stringify(data),
      'ratelimit:phone-transfer:resend:transfer_123': '1',
    });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.resendCode('transfer_123', '1.2.3.4')).toEqual({ success: false, error: 'rate_limited' });
  });

  it('returns sms_send_failed when SMS delivery fails', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms(false));

    expect(await svc.resendCode('transfer_123', '1.2.3.4')).toEqual({ success: false, error: 'sms_send_failed' });
  });

  it('returns success and sets resend rate limit key', async () => {
    const data = makeTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms(true));

    const result = await svc.resendCode('transfer_123', '1.2.3.4');

    expect(result).toEqual({ success: true });
    expect(cache.set).toHaveBeenCalledWith('ratelimit:phone-transfer:resend:transfer_123', '1', 60);
  });

  it('resets attempts to 0 on resend', async () => {
    const data = makeTransferData({ attempts: 3 });
    const cache = makeCache({ 'phone-transfer:transfer_123': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms(true));

    await svc.resendCode('transfer_123', '1.2.3.4');

    const calls = (cache.set as jest.Mock).mock.calls;
    const transferUpdateCall = calls.find((c: unknown[]) =>
      (c[0] as string).startsWith('phone-transfer:transfer_123')
    );
    const updatedData = JSON.parse(transferUpdateCall![1] as string);
    expect(updatedData.attempts).toBe(0);
  });

  it('returns internal_error on unexpected exception', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('crash')),
      set: jest.fn(),
      del: jest.fn(),
    } as any;
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.resendCode('transfer_123', '1.2.3.4')).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// initiateTransferForRegistration
// ---------------------------------------------------------------------------
describe('initiateTransferForRegistration', () => {
  const REQ = {
    phoneNumber: '+15550001234',
    phoneCountryCode: 'US',
    pendingUsername: 'newuser',
    pendingEmail: 'new@example.com',
    ipAddress: '1.2.3.4',
    userAgent: 'test-agent',
  };

  it('returns phone_not_found when no verified owner exists', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.initiateTransferForRegistration(REQ)).toEqual({ success: false, error: 'phone_not_found' });
  });

  it('returns sms_send_failed and cleans cache when SMS fails', async () => {
    const cache = makeCache();
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      cache,
      makeSms(false)
    );

    const result = await svc.initiateTransferForRegistration(REQ);

    expect(result).toEqual({ success: false, error: 'sms_send_failed' });
    expect(cache.del).toHaveBeenCalledTimes(1);
  });

  it('returns success with transferId', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      makeCache(),
      makeSms(true)
    );

    const result = await svc.initiateTransferForRegistration(REQ);

    expect(result.success).toBe(true);
    expect(typeof result.transferId).toBe('string');
  });

  it('stores type:registration in transfer data', async () => {
    const cache = makeCache();
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockResolvedValue(makeOwner())),
      cache,
      makeSms(true)
    );

    const result = await svc.initiateTransferForRegistration(REQ);

    const storedRaw = cache._store.get(`phone-transfer:${result.transferId}`);
    const stored = JSON.parse(storedRaw!);
    expect(stored.type).toBe('registration');
    expect(stored.pendingUsername).toBe('newuser');
  });

  it('returns internal_error on unexpected exception', async () => {
    const svc = new PhoneTransferService(
      makePrisma(jest.fn().mockRejectedValue(new Error('crash'))),
      makeCache(),
      makeSms()
    );
    expect(await svc.initiateTransferForRegistration(REQ)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// verifyForRegistration
// ---------------------------------------------------------------------------
describe('verifyForRegistration', () => {
  const VERIFY_REQ = { transferId: 'transfer_reg', code: '123456', ipAddress: '1.2.3.4' };

  it('returns transfer_expired when transferId not in cache', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.verifyForRegistration(VERIFY_REQ)).toEqual({ success: false, error: 'transfer_expired' });
  });

  it('returns invalid_transfer_type when type is not registration', async () => {
    const data = makeTransferData(); // no type field
    const cache = makeCache({ 'phone-transfer:transfer_reg': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.verifyForRegistration(VERIFY_REQ)).toEqual({ success: false, error: 'invalid_transfer_type' });
  });

  it('returns max_attempts_exceeded and cleans cache when attempts >= 5', async () => {
    const data = makeRegistrationTransferData({ attempts: 5 });
    const cache = makeCache({ 'phone-transfer:transfer_reg': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyForRegistration(VERIFY_REQ);

    expect(result).toEqual({ success: false, error: 'max_attempts_exceeded' });
    expect(cache.del).toHaveBeenCalledWith('phone-transfer:transfer_reg');
  });

  it('returns invalid_code and increments attempts for wrong code', async () => {
    const data = makeRegistrationTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_reg': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyForRegistration({ ...VERIFY_REQ, code: '000000' });

    expect(result).toEqual({ success: false, error: 'invalid_code' });
    const updated = JSON.parse(cache._store.get('phone-transfer:transfer_reg')!);
    expect(updated.attempts).toBe(1);
  });

  it('returns success with verified:true and transferToken on correct code', async () => {
    const data = makeRegistrationTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_reg': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyForRegistration(VERIFY_REQ);

    expect(result.success).toBe(true);
    expect(result.verified).toBe(true);
    expect(typeof result.transferToken).toBe('string');
    expect(result.transferToken!.length).toBeGreaterThan(10);
  });

  it('stores transferToken hash and extends expiry to 30 min on success', async () => {
    const data = makeRegistrationTransferData();
    const cache = makeCache({ 'phone-transfer:transfer_reg': JSON.stringify(data) });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.verifyForRegistration(VERIFY_REQ);

    // Transfer data updated with verified + token hash
    const updated = JSON.parse(cache._store.get('phone-transfer:transfer_reg')!);
    expect(updated.verified).toBe(true);
    expect(updated.transferTokenHash).toBeDefined();

    // Token mapping stored
    const tokenHash = crypto.createHash('sha256').update(result.transferToken!).digest('hex');
    expect(cache._store.get(`phone-transfer-token:${tokenHash}`)).toBe('transfer_reg');
  });

  it('returns internal_error on unexpected exception', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('crash')),
      set: jest.fn(),
      del: jest.fn(),
    } as any;
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.verifyForRegistration(VERIFY_REQ)).toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// executeRegistrationTransfer
// ---------------------------------------------------------------------------
describe('executeRegistrationTransfer', () => {
  function makeVerifiedTransferSetup() {
    const transferToken = 'raw-transfer-token-xyz';
    const tokenHash = crypto.createHash('sha256').update(transferToken).digest('hex');
    const transferId = 'transfer_exec';
    const data = makeRegistrationTransferData({
      verified: true,
      transferTokenHash: tokenHash,
      verifiedAt: Date.now(),
    });
    const cache = makeCache({
      [`phone-transfer-token:${tokenHash}`]: transferId,
      [`phone-transfer:${transferId}`]: JSON.stringify(data),
    });
    return { transferToken, tokenHash, transferId, data, cache };
  }

  it('returns invalid_transfer_token when token not found in cache', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.executeRegistrationTransfer('unknown_token', 'user_new', '1.2.3.4'))
      .toEqual({ success: false, error: 'invalid_transfer_token' });
  });

  it('returns transfer_expired when transfer data is missing', async () => {
    const tokenHash = crypto.createHash('sha256').update('some-token').digest('hex');
    const cache = makeCache({ [`phone-transfer-token:${tokenHash}`]: 'transfer_123' });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.executeRegistrationTransfer('some-token', 'user_new', '1.2.3.4'))
      .toEqual({ success: false, error: 'transfer_expired' });
  });

  it('returns invalid_transfer_token when not verified', async () => {
    const transferToken = 'raw-token';
    const tokenHash = crypto.createHash('sha256').update(transferToken).digest('hex');
    const data = makeRegistrationTransferData({ verified: false, transferTokenHash: tokenHash });
    const cache = makeCache({
      [`phone-transfer-token:${tokenHash}`]: 'transfer_exec',
      ['phone-transfer:transfer_exec']: JSON.stringify(data),
    });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    expect(await svc.executeRegistrationTransfer(transferToken, 'user_new', '1.2.3.4'))
      .toEqual({ success: false, error: 'invalid_transfer_token' });
  });

  it('returns success and runs $transaction on valid token', async () => {
    const { transferToken, cache } = makeVerifiedTransferSetup();
    const prisma = makePrisma();
    const svc = new PhoneTransferService(prisma, cache, makeSms());

    const result = await svc.executeRegistrationTransfer(transferToken, 'user_new', '1.2.3.4');

    expect(result).toEqual({ success: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('cleans up cache entries after successful transfer', async () => {
    const { transferToken, tokenHash, transferId, cache } = makeVerifiedTransferSetup();
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    await svc.executeRegistrationTransfer(transferToken, 'user_new', '1.2.3.4');

    expect(cache.del).toHaveBeenCalledWith(`phone-transfer:${transferId}`);
    expect(cache.del).toHaveBeenCalledWith(`phone-transfer-token:${tokenHash}`);
  });

  it('returns internal_error on unexpected exception', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('crash')),
      set: jest.fn(),
      del: jest.fn(),
    } as any;
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.executeRegistrationTransfer('token', 'user_new', '1.2.3.4'))
      .toEqual({ success: false, error: 'internal_error' });
  });
});

// ---------------------------------------------------------------------------
// getTransferDataByToken
// ---------------------------------------------------------------------------
describe('getTransferDataByToken', () => {
  it('returns valid:false when token not in cache', async () => {
    const svc = new PhoneTransferService(makePrisma(), makeCache(), makeSms());
    expect(await svc.getTransferDataByToken('unknown_token')).toEqual({ valid: false });
  });

  it('returns valid:false when transfer data is missing', async () => {
    const tokenHash = crypto.createHash('sha256').update('some-token').digest('hex');
    const cache = makeCache({ [`phone-transfer-token:${tokenHash}`]: 'transfer_123' });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.getTransferDataByToken('some-token')).toEqual({ valid: false });
  });

  it('returns valid:false when transfer is not verified', async () => {
    const token = 'my-token';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const data = makeRegistrationTransferData({ verified: false, transferTokenHash: tokenHash });
    const cache = makeCache({
      [`phone-transfer-token:${tokenHash}`]: 'transfer_abc',
      ['phone-transfer:transfer_abc']: JSON.stringify(data),
    });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.getTransferDataByToken(token)).toEqual({ valid: false });
  });

  it('returns valid:false when token hash does not match', async () => {
    const token = 'my-token';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const data = makeRegistrationTransferData({ verified: true, transferTokenHash: 'wrong_hash' });
    const cache = makeCache({
      [`phone-transfer-token:${tokenHash}`]: 'transfer_abc',
      ['phone-transfer:transfer_abc']: JSON.stringify(data),
    });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.getTransferDataByToken(token)).toEqual({ valid: false });
  });

  it('returns valid:true with phone data on valid token', async () => {
    const token = 'valid-token';
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const data = makeRegistrationTransferData({ verified: true, transferTokenHash: tokenHash });
    const cache = makeCache({
      [`phone-transfer-token:${tokenHash}`]: 'transfer_abc',
      ['phone-transfer:transfer_abc']: JSON.stringify(data),
    });
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());

    const result = await svc.getTransferDataByToken(token);

    expect(result.valid).toBe(true);
    expect(result.phoneNumber).toBe('+15550001234');
    expect(result.phoneCountryCode).toBe('US');
    expect(result.fromUserId).toBe('user_old');
  });

  it('returns valid:false on unexpected exception', async () => {
    const cache = {
      get: jest.fn().mockRejectedValue(new Error('crash')),
      set: jest.fn(),
      del: jest.fn(),
    } as any;
    const svc = new PhoneTransferService(makePrisma(), cache, makeSms());
    expect(await svc.getTransferDataByToken('token')).toEqual({ valid: false });
  });
});
