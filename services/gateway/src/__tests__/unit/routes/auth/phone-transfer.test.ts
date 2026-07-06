/**
 * Unit tests for auth phone-transfer routes (phone-transfer.ts)
 * Tests POST /phone-transfer/check, /initiate, /verify, /resend, /cancel,
 * /initiate-registration, /verify-registration.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

jest.mock('@meeshy/shared/types', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

const mockGetRequestContext = jest.fn<any>().mockResolvedValue({
  ip: '127.0.0.1',
  userAgent: 'test-agent',
  deviceInfo: null,
  geoData: null,
});
jest.mock('../../../../services/GeoIPService', () => ({
  getRequestContext: (...args: any[]) => mockGetRequestContext(...args),
}));

const mockNormalizePhone = jest.fn<any>().mockReturnValue({
  isValid: true,
  phoneNumber: '+33612345678',
  countryCode: 'FR',
});
jest.mock('../../../../utils/normalize', () => ({
  normalizePhoneWithCountry: (...args: any[]) => mockNormalizePhone(...args),
}));

const mockPhoneTransferMiddleware = jest.fn<any>().mockReturnValue(async () => {});
jest.mock('../../../../utils/rate-limiter.js', () => ({
  createPhoneTransferRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneTransferMiddleware() })),
  createPhoneTransferCodeRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneTransferMiddleware() })),
  createPhoneTransferResendRateLimiter: jest.fn(() => ({ middleware: () => mockPhoneTransferMiddleware() })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerPhoneTransferRoutes } from '../../../../routes/auth/phone-transfer';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePhoneTransferService(overrides: Record<string, any> = {}) {
  return {
    checkPhoneOwnership: jest.fn<any>().mockResolvedValue({ exists: false, maskedInfo: null }),
    initiateTransfer: jest.fn<any>().mockResolvedValue({
      success: true,
      transferId: 'transfer-abc',
      maskedOwnerInfo: { displayName: 'Other User', username: 'other', email: 'o***@test.com' },
    }),
    verifyAndTransfer: jest.fn<any>().mockResolvedValue({ success: true, transferred: true }),
    resendCode: jest.fn<any>().mockResolvedValue({ success: true }),
    cancelTransfer: jest.fn<any>().mockResolvedValue(undefined),
    initiateTransferForRegistration: jest.fn<any>().mockResolvedValue({
      success: true,
      transferId: 'reg-transfer-abc',
    }),
    verifyForRegistration: jest.fn<any>().mockResolvedValue({
      success: true,
      verified: true,
      transferToken: 'transfer-token-xyz',
    }),
    ...overrides,
  };
}

async function buildApp(opts: {
  phoneTransferService?: any;
} = {}): Promise<FastifyInstance> {
  const { phoneTransferService = makePhoneTransferService() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const context = {
    fastify: app,
    phoneTransferService,
    authService: {} as any,
    smsService: {} as any,
    cacheStore: {} as any,
    redis: null,
    prisma: null,
  };

  registerPhoneTransferRoutes(context as any);
  await app.ready();
  return app;
}

// ─── POST /phone-transfer/check ───────────────────────────────────────────────

describe('POST /phone-transfer/check — phone not owned', () => {
  it('returns 200 with exists: false', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/check — phone owned by another user', () => {
  it('returns 200 with exists: true and masked info', async () => {
    const svc = makePhoneTransferService({
      checkPhoneOwnership: jest.fn<any>().mockResolvedValue({
        exists: true,
        maskedInfo: { displayName: 'Other', username: 'other', email: 'o***@test.com' },
      }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/check — invalid phone number', () => {
  it('returns 400 when phone normalization fails', async () => {
    mockNormalizePhone.mockReturnValueOnce({ isValid: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /phone-transfer/check — service error', () => {
  it('returns 500 when service throws', async () => {
    const svc = makePhoneTransferService({
      checkPhoneOwnership: jest.fn<any>().mockRejectedValue(new Error('DB error')),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/check',
      payload: { phoneNumber: '+33612345678' },
    });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── POST /phone-transfer/initiate ────────────────────────────────────────────

describe('POST /phone-transfer/initiate — success', () => {
  it('returns 200 with transferId and masked owner info', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-new-123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/initiate — invalid phone', () => {
  it('returns 400 when phone is invalid', async () => {
    mockNormalizePhone.mockReturnValueOnce({ isValid: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: 'bad', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /phone-transfer/initiate — service failure', () => {
  it('returns 400 when initiateTransfer returns failure', async () => {
    const svc = makePhoneTransferService({
      initiateTransfer: jest.fn<any>().mockResolvedValue({ success: false, error: 'Phone not found' }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate',
      payload: { phoneNumber: '+33612345678', newUserId: 'user-123' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /phone-transfer/verify ─────────────────────────────────────────────

describe('POST /phone-transfer/verify — success', () => {
  it('returns 200 with transferred: true', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/verify — wrong code', () => {
  it('returns 400 when code verification fails', async () => {
    const svc = makePhoneTransferService({
      verifyAndTransfer: jest.fn<any>().mockResolvedValue({ success: false, error: 'Code invalide' }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify',
      payload: { transferId: 'transfer-abc', code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /phone-transfer/resend ──────────────────────────────────────────────

describe('POST /phone-transfer/resend — success', () => {
  it('returns 200 on successful resend', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/resend — failure', () => {
  it('returns 400 when resend fails', async () => {
    const svc = makePhoneTransferService({
      resendCode: jest.fn<any>().mockResolvedValue({ success: false, error: 'Too many attempts' }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/resend',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /phone-transfer/cancel ──────────────────────────────────────────────

describe('POST /phone-transfer/cancel — success', () => {
  it('returns 200 on cancel', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/cancel — service throws', () => {
  it('returns 200 even when cancelTransfer throws (swallows errors)', async () => {
    const svc = makePhoneTransferService({
      cancelTransfer: jest.fn<any>().mockRejectedValue(new Error('DB error')),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/cancel',
      payload: { transferId: 'transfer-abc' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ─── POST /phone-transfer/initiate-registration ───────────────────────────────

describe('POST /phone-transfer/initiate-registration — success', () => {
  it('returns 200 with transferId', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'newuser',
        pendingEmail: 'new@test.com',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/initiate-registration — invalid phone', () => {
  it('returns 400 when phone is invalid', async () => {
    mockNormalizePhone.mockReturnValueOnce({ isValid: false });
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: 'bad',
        pendingUsername: 'newuser',
        pendingEmail: 'new@test.com',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

describe('POST /phone-transfer/initiate-registration — service failure', () => {
  it('returns 400 when service returns failure', async () => {
    const svc = makePhoneTransferService({
      initiateTransferForRegistration: jest.fn<any>().mockResolvedValue({
        success: false,
        error: 'Phone not associated',
      }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/initiate-registration',
      payload: {
        phoneNumber: '+33612345678',
        pendingUsername: 'newuser',
        pendingEmail: 'new@test.com',
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// ─── POST /phone-transfer/verify-registration ─────────────────────────────────

describe('POST /phone-transfer/verify-registration — success', () => {
  it('returns 200 with verified and transferToken', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-abc', code: '123456' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    await app.close();
  });
});

describe('POST /phone-transfer/verify-registration — wrong code', () => {
  it('returns 400 when verification fails', async () => {
    const svc = makePhoneTransferService({
      verifyForRegistration: jest.fn<any>().mockResolvedValue({ success: false, error: 'Code invalide' }),
    });
    const app = await buildApp({ phoneTransferService: svc });
    const res = await app.inject({
      method: 'POST',
      url: '/phone-transfer/verify-registration',
      payload: { transferId: 'reg-transfer-abc', code: '000000' },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
