/**
 * Unit tests for auth/phone-transfer.ts routes.
 *
 * Covers all 7 routes:
 *   POST /phone-transfer/check
 *   POST /phone-transfer/initiate
 *   POST /phone-transfer/verify
 *   POST /phone-transfer/resend
 *   POST /phone-transfer/cancel
 *   POST /phone-transfer/initiate-registration
 *   POST /phone-transfer/verify-registration
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (must come before any import of the route file) ───────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// Rate limiters — pass-through middleware
jest.mock('../../../utils/rate-limiter.js', () => ({
  createPhoneTransferRateLimiter: () => ({ middleware: () => async () => {} }),
  createPhoneTransferCodeRateLimiter: () => ({ middleware: () => async () => {} }),
  createPhoneTransferResendRateLimiter: () => ({ middleware: () => async () => {} }),
}));

const mockGetRequestContext = jest.fn<any>();
jest.mock('../../../services/GeoIPService', () => ({
  getRequestContext: (...a: any[]) => mockGetRequestContext(...a),
}));

const mockNormalizePhoneWithCountry = jest.fn<any>();
jest.mock('../../../utils/normalize', () => ({
  normalizePhoneWithCountry: (...a: any[]) => mockNormalizePhoneWithCountry(...a),
}));

jest.mock('@meeshy/shared/types', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
}));

// ─── Import route under test ──────────────────────────────────────────────────

import { registerPhoneTransferRoutes } from '../../../routes/auth/phone-transfer';

// ─── Factories ────────────────────────────────────────────────────────────────

const VALID_NORMALIZED = { isValid: true, phoneNumber: '+33612345678', countryCode: 'FR' };
const INVALID_NORMALIZED = { isValid: false };
const REQUEST_CONTEXT = { ip: '127.0.0.1', userAgent: 'TestAgent/1.0' };

function makePhoneTransferService(overrides: any = {}) {
  return {
    checkPhoneOwnership: jest.fn<any>().mockResolvedValue({ exists: false, maskedInfo: null }),
    initiateTransfer: jest.fn<any>().mockResolvedValue({
      success: true,
      transferId: 'transfer-abc',
      maskedOwnerInfo: { displayName: 'John D.', username: 'john', email: 'j***@ex.com' },
    }),
    verifyAndTransfer: jest.fn<any>().mockResolvedValue({ success: true, transferred: true }),
    resendCode: jest.fn<any>().mockResolvedValue({ success: true }),
    cancelTransfer: jest.fn<any>().mockResolvedValue(undefined),
    initiateTransferForRegistration: jest.fn<any>().mockResolvedValue({
      success: true,
      transferId: 'reg-transfer-xyz',
    }),
    verifyForRegistration: jest.fn<any>().mockResolvedValue({
      success: true,
      verified: true,
      transferToken: 'reg-token-abc',
    }),
    ...overrides,
  };
}

async function buildApp(phoneTransferService: any = makePhoneTransferService()): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    ajv: { customOptions: { strict: false, keywords: ['example'] } },
  });

  const context: any = {
    fastify: app,
    phoneTransferService,
    redis: {},
  };

  registerPhoneTransferRoutes(context);
  await app.ready();
  return app;
}

// ─── POST /phone-transfer/check ───────────────────────────────────────────────

describe('POST /phone-transfer/check', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 with exists=false when phone is not taken', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 200 with exists=true when phone belongs to another account', async () => {
    const svc = makePhoneTransferService({
      checkPhoneOwnership: jest.fn<any>().mockResolvedValue({
        exists: true,
        maskedInfo: { displayName: 'J. D.', username: 'jd', email: 'j***@ex.com' },
      }),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await localApp.close();
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBeUndefined(); // Fastify schema validation reply
  });

  it('returns 400 when normalized phone is invalid', async () => {
    mockNormalizePhoneWithCountry.mockReturnValue(INVALID_NORMALIZED);

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('returns 400 when normalizer returns null', async () => {
    mockNormalizePhoneWithCountry.mockReturnValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('returns 500 when checkPhoneOwnership throws', async () => {
    const svc = makePhoneTransferService({
      checkPhoneOwnership: jest.fn<any>().mockRejectedValue(new Error('DB error')),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });
});

// ─── POST /phone-transfer/initiate ────────────────────────────────────────────

describe('POST /phone-transfer/initiate', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 with transferId on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when newUserId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when normalized phone is invalid', async () => {
    mockNormalizePhoneWithCountry.mockReturnValue(INVALID_NORMALIZED);

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: 'bad-number', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('returns 400 when initiateTransfer returns success=false', async () => {
    const svc = makePhoneTransferService({
      initiateTransfer: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Phone number not found in any account',
      }),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when initiateTransfer throws', async () => {
    const svc = makePhoneTransferService({
      initiateTransfer: jest.fn<any>().mockRejectedValue(new Error('SMS service down')),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when getRequestContext throws', async () => {
    mockGetRequestContext.mockRejectedValue(new Error('context error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /phone-transfer/verify ──────────────────────────────────────────────

describe('POST /phone-transfer/verify', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 with transferred=true on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when transferId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { code: '123456' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when verifyAndTransfer returns success=false', async () => {
    const svc = makePhoneTransferService({
      verifyAndTransfer: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Invalid or expired code',
      }),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '999999' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when verifyAndTransfer throws', async () => {
    const svc = makePhoneTransferService({
      verifyAndTransfer: jest.fn<any>().mockRejectedValue(new Error('DB down')),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when getRequestContext throws', async () => {
    mockGetRequestContext.mockRejectedValue(new Error('context error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /phone-transfer/resend ──────────────────────────────────────────────

describe('POST /phone-transfer/resend', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when transferId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when resendCode returns success=false', async () => {
    const svc = makePhoneTransferService({
      resendCode: jest.fn<any>().mockResolvedValue({ success: false, error: 'Too many resends' }),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when resendCode throws', async () => {
    const svc = makePhoneTransferService({
      resendCode: jest.fn<any>().mockRejectedValue(new Error('SMS provider down')),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when getRequestContext throws', async () => {
    mockGetRequestContext.mockRejectedValue(new Error('context error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /phone-transfer/cancel ─────────────────────────────────────────────

describe('POST /phone-transfer/cancel', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when transferId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 200 even when cancelTransfer throws (error is swallowed)', async () => {
    const svc = makePhoneTransferService({
      cancelTransfer: jest.fn<any>().mockRejectedValue(new Error('Transfer not found')),
    });
    const localApp = await buildApp(svc);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'unknown-transfer' },
    });
    // The route catches the error and still returns sendSuccess
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await localApp.close();
  });
});

// ─── POST /phone-transfer/initiate-registration ───────────────────────────────

describe('POST /phone-transfer/initiate-registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 with transferId on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'alice',
        pendingEmail: 'alice@example.com',
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: { pendingUsername: 'alice', pendingEmail: 'alice@example.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when pendingUsername is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: { phoneNumber: '+33612345678', pendingEmail: 'alice@example.com' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when pendingEmail is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: { phoneNumber: '+33612345678', pendingUsername: 'alice' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when normalized phone is invalid', async () => {
    mockNormalizePhoneWithCountry.mockReturnValue(INVALID_NORMALIZED);

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: 'bad-number',
        pendingUsername: 'alice',
        pendingEmail: 'alice@example.com',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
  });

  it('returns 400 when initiateTransferForRegistration returns success=false', async () => {
    const svc = makePhoneTransferService({
      initiateTransferForRegistration: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Phone number not found',
      }),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'alice',
        pendingEmail: 'alice@example.com',
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when initiateTransferForRegistration throws', async () => {
    const svc = makePhoneTransferService({
      initiateTransferForRegistration: jest.fn<any>().mockRejectedValue(new Error('SMS down')),
    });
    const localApp = await buildApp(svc);
    mockNormalizePhoneWithCountry.mockReturnValue(VALID_NORMALIZED);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'alice',
        pendingEmail: 'alice@example.com',
      },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when getRequestContext throws', async () => {
    mockGetRequestContext.mockRejectedValue(new Error('context error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'alice',
        pendingEmail: 'alice@example.com',
      },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});

// ─── POST /phone-transfer/verify-registration ─────────────────────────────────

describe('POST /phone-transfer/verify-registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);
  });

  it('returns 200 with verified=true and transferToken on success', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-xyz', code: '654321' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when transferId is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { code: '654321' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when code is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-xyz' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when verifyForRegistration returns success=false', async () => {
    const svc = makePhoneTransferService({
      verifyForRegistration: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Code expired',
      }),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-xyz', code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when verifyForRegistration throws', async () => {
    const svc = makePhoneTransferService({
      verifyForRegistration: jest.fn<any>().mockRejectedValue(new Error('DB unavailable')),
    });
    const localApp = await buildApp(svc);
    mockGetRequestContext.mockResolvedValue(REQUEST_CONTEXT);

    const res = await localApp.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-xyz', code: '654321' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
    await localApp.close();
  });

  it('returns 500 when getRequestContext throws', async () => {
    mockGetRequestContext.mockRejectedValue(new Error('context error'));

    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-xyz', code: '654321' },
    });
    expect(res.statusCode).toBe(500);
    expect(res.json().success).toBe(false);
  });
});
