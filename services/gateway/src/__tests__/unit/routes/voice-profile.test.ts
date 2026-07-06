/**
 * Unit tests for voice profile routes (voice-profile.ts)
 * Tests all 6 endpoints: consent, register, update, get, delete.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: { getInstance: jest.fn().mockResolvedValue({}) },
}));

const mockUpdateConsent = jest.fn();
const mockGetConsentStatus = jest.fn();
const mockRegisterProfile = jest.fn();
const mockUpdateProfile = jest.fn();
const mockGetProfile = jest.fn();
const mockDeleteProfile = jest.fn();

jest.mock('../../../services/VoiceProfileService', () => ({
  VoiceProfileService: jest.fn().mockImplementation(() => ({
    updateConsent: (...args: any[]) => mockUpdateConsent(...args),
    getConsentStatus: (...args: any[]) => mockGetConsentStatus(...args),
    registerProfile: (...args: any[]) => mockRegisterProfile(...args),
    updateProfile: (...args: any[]) => mockUpdateProfile(...args),
    getProfile: (...args: any[]) => mockGetProfile(...args),
    deleteProfile: (...args: any[]) => mockDeleteProfile(...args),
  })),
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: {} },
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { voiceProfileRoutes } from '../../../routes/voice-profile';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const PROFILE_ID = 'prof-001';

const mockAuthContext = {
  type: 'registered' as const,
  isAuthenticated: true,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: {
    id: USER_ID, username: 'alice', firstName: 'Alice', lastName: 'Smith',
    displayName: 'Alice Smith', avatar: null, role: 'USER',
  },
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {});

  await voiceProfileRoutes(app);
  await app.ready();
  return app;
}

// ─── POST /consent ────────────────────────────────────────────────────────────

describe('POST /consent', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful consent update', async () => {
    mockUpdateConsent.mockResolvedValueOnce({
      success: true,
      data: { voiceRecordingConsentAt: new Date().toISOString(), voiceCloningEnabledAt: null, ageVerificationConsentAt: null },
    });
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: true },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when service returns error', async () => {
    mockUpdateConsent.mockResolvedValueOnce({ success: false, error: 'Invalid consent data', errorCode: 'INVALID_CONSENT' });
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: false },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when voiceRecordingConsent missing from body (schema required)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── GET /consent ─────────────────────────────────────────────────────────────

describe('GET /consent', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with consent status', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({
      success: true,
      data: { voiceRecordingConsentAt: null, voiceCloningEnabledAt: null, ageVerificationConsentAt: null },
    });
    const res = await app.inject({ method: 'GET', url: '/consent' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 when service returns error', async () => {
    mockGetConsentStatus.mockResolvedValueOnce({ success: false, error: 'Error', errorCode: 'ERROR' });
    const res = await app.inject({ method: 'GET', url: '/consent' });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /register ───────────────────────────────────────────────────────────

describe('POST /register', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 when audioData missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when consent not given', async () => {
    mockRegisterProfile.mockResolvedValueOnce({
      success: false, error: 'Consent required', errorCode: 'CONSENT_REQUIRED',
    });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when profile already exists', async () => {
    mockRegisterProfile.mockResolvedValueOnce({
      success: false, error: 'Profile exists', errorCode: 'PROFILE_EXISTS',
    });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 201 on successful registration', async () => {
    mockRegisterProfile.mockResolvedValueOnce({
      success: true,
      data: { profileId: PROFILE_ID, qualityScore: 85, audioDurationMs: 12000, needsCalibration: false, expiresAt: null },
    });
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().success).toBe(true);
  });
});

// ─── PUT /:profileId ──────────────────────────────────────────────────────────

describe('PUT /:profileId', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 404 when profile not found', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ success: false, error: 'Not found', errorCode: 'PROFILE_NOT_FOUND' });
    const res = await app.inject({
      method: 'PUT', url: '/' + PROFILE_ID,
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when fingerprint mismatch', async () => {
    mockUpdateProfile.mockResolvedValueOnce({ success: false, error: 'Mismatch', errorCode: 'PROFILE_MISMATCH' });
    const res = await app.inject({
      method: 'PUT', url: '/' + PROFILE_ID,
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 200 on successful update', async () => {
    mockUpdateProfile.mockResolvedValueOnce({
      success: true,
      data: { profileId: PROFILE_ID, qualityScore: 88, audioDurationMs: 15000, version: 2, updatedAt: new Date().toISOString() },
    });
    const res = await app.inject({
      method: 'PUT', url: '/' + PROFILE_ID,
      payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });
});

// ─── GET / (get profile) ──────────────────────────────────────────────────────

describe('GET /', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with default config when profile not found', async () => {
    mockGetProfile.mockResolvedValueOnce({ success: false, errorCode: 'PROFILE_NOT_FOUND' });
    mockGetConsentStatus.mockResolvedValueOnce({ success: true, data: { voiceRecordingConsentAt: null, voiceCloningEnabledAt: null, ageVerificationConsentAt: null } });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.exists).toBe(false);
  });

  it('returns 200 with profile data when profile exists', async () => {
    mockGetProfile.mockResolvedValueOnce({
      success: true,
      data: { profileId: PROFILE_ID, qualityScore: 85, audioDurationMs: 12000, exists: true },
    });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.exists).toBe(true);
  });

  it('returns 400 on service error', async () => {
    mockGetProfile.mockResolvedValueOnce({ success: false, error: 'Error', errorCode: 'OTHER_ERROR' });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(400);
  });
});

// ─── DELETE / ─────────────────────────────────────────────────────────────────

describe('DELETE /', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful deletion', async () => {
    mockDeleteProfile.mockResolvedValueOnce({
      success: true,
      data: { message: 'Voice profile deleted and consents revoked', deletedProfileId: PROFILE_ID },
    });
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('returns 400 on service error', async () => {
    mockDeleteProfile.mockResolvedValueOnce({ success: false, error: 'Cannot delete', errorCode: 'ERROR' });
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(400);
  });
});
