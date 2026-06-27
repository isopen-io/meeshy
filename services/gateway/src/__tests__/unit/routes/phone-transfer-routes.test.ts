/**
 * phone-transfer-routes.test.ts
 *
 * Unit tests for src/routes/auth/phone-transfer.ts
 * Covers all 7 routes:
 *   POST /phone-transfer/check
 *   POST /phone-transfer/initiate
 *   POST /phone-transfer/verify
 *   POST /phone-transfer/resend
 *   POST /phone-transfer/cancel
 *   POST /phone-transfer/initiate-registration
 *   POST /phone-transfer/verify-registration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ---------------------------------------------------------------------------
// Module mocks — MUST come before any imports of the module under test
// ---------------------------------------------------------------------------

const mockGetRequestContext = jest.fn<any>();
jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

jest.mock('../../../utils/rate-limiter', () => ({
  createPhoneTransferRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createPhoneTransferCodeRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
  createPhoneTransferResendRateLimiter: jest.fn(() => ({ middleware: jest.fn(() => async () => {}) })),
}));

const mockNormalizePhoneWithCountry = jest.fn<any>();
jest.mock('../../../utils/normalize', () => ({
  normalizePhoneWithCountry: (...args: any[]) => mockNormalizePhoneWithCountry(...args),
}));

jest.mock('@meeshy/shared/types', () => ({
  errorResponseSchema: { type: 'object', additionalProperties: true },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() })),
  },
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { registerPhoneTransferRoutes } from '../../../routes/auth/phone-transfer';

// ---------------------------------------------------------------------------
// Mock phoneTransferService
// ---------------------------------------------------------------------------

const mockPhoneTransferService = {
  checkPhoneOwnership: jest.fn<any>(),
  initiateTransfer: jest.fn<any>(),
  verifyAndTransfer: jest.fn<any>(),
  resendCode: jest.fn<any>(),
  cancelTransfer: jest.fn<any>().mockResolvedValue(undefined),
  initiateTransferForRegistration: jest.fn<any>(),
  verifyForRegistration: jest.fn<any>(),
};

// ---------------------------------------------------------------------------
// App builder
// ---------------------------------------------------------------------------

function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  registerPhoneTransferRoutes({
    fastify: app,
    phoneTransferService: mockPhoneTransferService as any,
    redis: null,
    authService: null as any,
    smsService: null as any,
    cacheStore: null as any,
    prisma: {} as any,
  } as any);
  return app;
}

// ---------------------------------------------------------------------------
// POST /phone-transfer/check
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/check', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with exists: false when phone not found', async () => {
    await app.ready();
    mockPhoneTransferService.checkPhoneOwnership.mockResolvedValue({ exists: false });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678', countryCode: 'FR' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.exists).toBe(false);
    expect(mockPhoneTransferService.checkPhoneOwnership).toHaveBeenCalledWith('+33612345678');
  });

  it('returns 200 with exists: true and maskedInfo when phone belongs to another account', async () => {
    await app.ready();
    const maskedInfo = { displayName: 'Bob', username: 'bob', email: 'b*@example.com' };
    mockPhoneTransferService.checkPhoneOwnership.mockResolvedValue({ exists: true, maskedInfo });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.exists).toBe(true);
    expect(body.data.maskedInfo).toEqual(maskedInfo);
  });

  it('returns 400 when phone number is invalid', async () => {
    await app.ready();
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: false });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: 'bad-number' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(mockPhoneTransferService.checkPhoneOwnership).not.toHaveBeenCalled();
  });

  it('returns 500 on service error', async () => {
    await app.ready();
    mockPhoneTransferService.checkPhoneOwnership.mockRejectedValue(new Error('DB error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/initiate
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/initiate', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with transferId when initiation succeeds', async () => {
    await app.ready();
    mockPhoneTransferService.initiateTransfer.mockResolvedValue({
      success: true,
      transferId: 'transfer-123',
      maskedOwnerInfo: { displayName: 'Bob' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-abc' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.transferId).toBe('transfer-123');
    expect(body.data.maskedOwnerInfo).toEqual({ displayName: 'Bob' });
    expect(mockPhoneTransferService.initiateTransfer).toHaveBeenCalledWith({
      phoneNumber: '+33612345678',
      phoneCountryCode: 'FR',
      newUserId: 'user-abc',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('returns 400 when phone is invalid', async () => {
    await app.ready();
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: false });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: 'bad-number', newUserId: 'user-abc' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(mockPhoneTransferService.initiateTransfer).not.toHaveBeenCalled();
  });

  it('returns 400 when service returns { success: false, error }', async () => {
    await app.ready();
    mockPhoneTransferService.initiateTransfer.mockResolvedValue({
      success: false,
      error: 'some error',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-abc' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('some error');
  });

  it('returns 500 on exception', async () => {
    await app.ready();
    mockPhoneTransferService.initiateTransfer.mockRejectedValue(new Error('Unexpected'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-abc' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/verify
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/verify', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with transferred: true when verification succeeds', async () => {
    await app.ready();
    mockPhoneTransferService.verifyAndTransfer.mockResolvedValue({ success: true, transferred: true });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-123', code: '654321' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.transferred).toBe(true);
    expect(mockPhoneTransferService.verifyAndTransfer).toHaveBeenCalledWith({
      transferId: 'transfer-123',
      code: '654321',
      ipAddress: '127.0.0.1',
    });
  });

  it('returns 400 when service returns { success: false, error }', async () => {
    await app.ready();
    mockPhoneTransferService.verifyAndTransfer.mockResolvedValue({
      success: false,
      error: 'Invalid code',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-123', code: '000000' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Invalid code');
  });

  it('returns 500 on exception', async () => {
    await app.ready();
    mockPhoneTransferService.verifyAndTransfer.mockRejectedValue(new Error('DB failure'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-123', code: '654321' },
    });

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/resend
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/resend', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 when resend succeeds', async () => {
    await app.ready();
    mockPhoneTransferService.resendCode.mockResolvedValue({ success: true });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockPhoneTransferService.resendCode).toHaveBeenCalledWith('transfer-123', '127.0.0.1');
  });

  it('returns 400 when service returns { success: false, error }', async () => {
    await app.ready();
    mockPhoneTransferService.resendCode.mockResolvedValue({
      success: false,
      error: 'Too many attempts',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-123' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Too many attempts');
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/cancel
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/cancel', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    mockPhoneTransferService.cancelTransfer.mockResolvedValue(undefined);
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 always (even when cancelTransfer throws)', async () => {
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'transfer-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(mockPhoneTransferService.cancelTransfer).toHaveBeenCalledWith('transfer-123');
  });

  it('returns 200 even when cancelTransfer throws an exception', async () => {
    await app.ready();
    mockPhoneTransferService.cancelTransfer.mockRejectedValue(new Error('Storage error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'transfer-123' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/initiate-registration
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/initiate-registration', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with transferId when initiation succeeds', async () => {
    await app.ready();
    mockPhoneTransferService.initiateTransferForRegistration.mockResolvedValue({
      success: true,
      transferId: 'reg-transfer-123',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'newuser',
        pendingEmail: 'new@example.com',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.transferId).toBe('reg-transfer-123');
    expect(mockPhoneTransferService.initiateTransferForRegistration).toHaveBeenCalledWith({
      phoneNumber: '+33612345678',
      phoneCountryCode: 'FR',
      pendingUsername: 'newuser',
      pendingEmail: 'new@example.com',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('returns 400 when phone is invalid', async () => {
    await app.ready();
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: false });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: 'bad-number',
        pendingUsername: 'newuser',
        pendingEmail: 'new@example.com',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(mockPhoneTransferService.initiateTransferForRegistration).not.toHaveBeenCalled();
  });

  it('returns 400 when service returns failure', async () => {
    await app.ready();
    mockPhoneTransferService.initiateTransferForRegistration.mockResolvedValue({
      success: false,
      error: 'Phone already in use by active account',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'newuser',
        pendingEmail: 'new@example.com',
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Phone already in use by active account');
  });
});

// ---------------------------------------------------------------------------
// POST /phone-transfer/verify-registration
// ---------------------------------------------------------------------------

describe('POST /phone-transfer/verify-registration', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue({ ip: '127.0.0.1', userAgent: 'test-agent' });
    mockNormalizePhoneWithCountry.mockReturnValue({ isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' });
    app = buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with verified: true and transferToken when verification succeeds', async () => {
    await app.ready();
    mockPhoneTransferService.verifyForRegistration.mockResolvedValue({
      success: true,
      verified: true,
      transferToken: 'tok-123',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-123', code: '112233' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.verified).toBe(true);
    expect(body.data.transferToken).toBe('tok-123');
    expect(mockPhoneTransferService.verifyForRegistration).toHaveBeenCalledWith({
      transferId: 'reg-transfer-123',
      code: '112233',
      ipAddress: '127.0.0.1',
    });
  });

  it('returns 400 when service returns failure', async () => {
    await app.ready();
    mockPhoneTransferService.verifyForRegistration.mockResolvedValue({
      success: false,
      error: 'Code expired',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-123', code: '000000' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Code expired');
  });
});
