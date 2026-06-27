/**
 * voice-profile-routes.test.ts
 *
 * Unit tests for src/routes/voice-profile.ts
 * Covers:
 *   - POST /consent
 *   - GET  /consent
 *   - POST /register
 *   - PUT  /:profileId
 *   - GET  /
 *   - DELETE /
 */

import Fastify, { FastifyInstance } from 'fastify';
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

// ---------------------------------------------------------------------------
// Module mocks (before imports)
// ---------------------------------------------------------------------------

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
    }),
  },
}));

const mockAuthMiddleware = jest.fn<any>();

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn().mockReturnValue(
    async (req: any, reply: any) => mockAuthMiddleware(req, reply)
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue({}),
  },
}));

const mockUpdateConsent    = jest.fn<any>();
const mockGetConsentStatus = jest.fn<any>();
const mockRegisterProfile  = jest.fn<any>();
const mockUpdateProfile    = jest.fn<any>();
const mockGetProfile       = jest.fn<any>();
const mockDeleteProfile    = jest.fn<any>();

jest.mock('../../../services/VoiceProfileService', () => ({
  VoiceProfileService: jest.fn().mockImplementation(() => ({
    updateConsent:    (...args: any[]) => mockUpdateConsent(...args),
    getConsentStatus: (...args: any[]) => mockGetConsentStatus(...args),
    registerProfile:  (...args: any[]) => mockRegisterProfile(...args),
    updateProfile:    (...args: any[]) => mockUpdateProfile(...args),
    getProfile:       (...args: any[]) => mockGetProfile(...args),
    deleteProfile:    (...args: any[]) => mockDeleteProfile(...args),
  })),
}));

// ---------------------------------------------------------------------------
// Import route under test (after mocks)
// ---------------------------------------------------------------------------

import { voiceProfileRoutes } from '../../../routes/voice-profile';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const USER_ID    = '507f1f77bcf86cd799439011';
const PROFILE_ID = '507f1f77bcf86cd799439022';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuthOverrides = { isAuthenticated?: boolean; registeredUser?: any };

function buildApp(authOverrides: AuthOverrides = {}): FastifyInstance {
  const isAuthenticated = authOverrides.isAuthenticated ?? true;
  const registeredUser  = authOverrides.registeredUser !== undefined
    ? authOverrides.registeredUser
    : { id: USER_ID };

  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = { isAuthenticated, registeredUser, userId: isAuthenticated ? USER_ID : null };
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {});
  app.register(voiceProfileRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// POST /consent
// ---------------------------------------------------------------------------

describe('POST /consent', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockUpdateConsent.mockResolvedValue({ success: true, data: { voiceRecordingConsentAt: new Date().toISOString() } });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful consent update', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: true },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls voiceProfileService.updateConsent with correct args', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: true, voiceCloningConsent: false },
    });
    expect(mockUpdateConsent).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ voiceRecordingConsent: true })
    );
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: true },
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when service returns failure', async () => {
    mockUpdateConsent.mockResolvedValue({ success: false, error: 'INVALID_CONSENT' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: { voiceRecordingConsent: true },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when body is missing required field', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/consent',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /consent
// ---------------------------------------------------------------------------

describe('GET /consent', () => {
  let app: FastifyInstance;

  const mockConsentData = {
    voiceRecordingConsentAt: new Date().toISOString(),
    voiceCloningEnabledAt: null,
    ageVerificationConsentAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockGetConsentStatus.mockResolvedValue({ success: true, data: mockConsentData });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with consent status', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/consent' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls voiceProfileService.getConsentStatus with the user id', async () => {
    await app.ready();
    await app.inject({ method: 'GET', url: '/consent' });
    expect(mockGetConsentStatus).toHaveBeenCalledWith(USER_ID);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'GET', url: '/consent' });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when service returns failure', async () => {
    mockGetConsentStatus.mockResolvedValue({ success: false, error: 'DB_ERROR' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/consent' });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /register
// ---------------------------------------------------------------------------

describe('POST /register', () => {
  let app: FastifyInstance;

  const validPayload = {
    audioData: 'A'.repeat(200),
    audioFormat: 'wav',
  };

  const mockProfileResult = {
    success: true,
    data: {
      profileId: PROFILE_ID,
      qualityScore: 85,
      audioDurationMs: 12500,
      needsCalibration: false,
      expiresAt: null,
      transcription: null,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockRegisterProfile.mockResolvedValue(mockProfileResult);
  });

  afterEach(async () => { await app.close(); });

  it('returns 201 on successful registration', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('calls registerProfile with the user id and audio data', async () => {
    await app.ready();
    await app.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    expect(mockRegisterProfile).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ audioData: validPayload.audioData, audioFormat: 'wav' })
    );
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when audioData is missing from JSON body', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: { audioFormat: 'wav' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 403 when service returns CONSENT_REQUIRED', async () => {
    mockRegisterProfile.mockResolvedValue({ success: false, errorCode: 'CONSENT_REQUIRED' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 409 when service returns PROFILE_EXISTS', async () => {
    mockRegisterProfile.mockResolvedValue({ success: false, errorCode: 'PROFILE_EXISTS' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for other service failure', async () => {
    mockRegisterProfile.mockResolvedValue({ success: false, errorCode: 'AUDIO_TOO_SHORT' });
    await app.ready();
    const res = await app.inject({
      method: 'POST', url: '/register',
      payload: validPayload,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// PUT /:profileId
// ---------------------------------------------------------------------------

describe('PUT /:profileId', () => {
  let app: FastifyInstance;

  const validPayload = {
    audioData: 'B'.repeat(200),
    audioFormat: 'mp3',
  };

  const mockUpdateResult = {
    success: true,
    data: {
      profileId: PROFILE_ID,
      qualityScore: 88,
      audioDurationMs: 15000,
      version: 2,
      updatedAt: new Date().toISOString(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockUpdateProfile.mockResolvedValue(mockUpdateResult);
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful profile update', async () => {
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/${PROFILE_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({
      method: 'PUT', url: `/${PROFILE_ID}`,
      payload: validPayload,
    });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when profile not found', async () => {
    mockUpdateProfile.mockResolvedValue({ success: false, errorCode: 'PROFILE_NOT_FOUND' });
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/${PROFILE_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 403 when fingerprint mismatch', async () => {
    mockUpdateProfile.mockResolvedValue({ success: false, errorCode: 'PROFILE_MISMATCH' });
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/${PROFILE_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(403);
  });

  it('returns 400 for other service failure', async () => {
    mockUpdateProfile.mockResolvedValue({ success: false, errorCode: 'INVALID_AUDIO' });
    await app.ready();
    const res = await app.inject({
      method: 'PUT', url: `/${PROFILE_ID}`,
      payload: validPayload,
    });
    expect(res.statusCode).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// GET /
// ---------------------------------------------------------------------------

describe('GET /', () => {
  let app: FastifyInstance;

  const mockProfileData = {
    success: true,
    data: {
      profileId: PROFILE_ID,
      userId: USER_ID,
      qualityScore: 85,
      audioDurationMs: 12500,
      audioCount: 1,
      voiceCharacteristics: null,
      signatureShort: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: null,
      needsCalibration: false,
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockGetProfile.mockResolvedValue(mockProfileData);
    mockGetConsentStatus.mockResolvedValue({
      success: true,
      data: { voiceRecordingConsentAt: null, voiceCloningEnabledAt: null, ageVerificationConsentAt: null },
    });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 with profile data', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'GET', url: '/' });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns default data when profile not found', async () => {
    mockGetProfile.mockResolvedValue({ success: false, errorCode: 'PROFILE_NOT_FOUND' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.data.exists).toBe(false);
    expect(body.data.profileId).toBeNull();
  });

  it('returns 400 for other service failure', async () => {
    mockGetProfile.mockResolvedValue({ success: false, errorCode: 'DB_ERROR' });
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(400);
  });

  it('returns exists:true when profile is found', async () => {
    await app.ready();
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.data.exists).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DELETE /
// ---------------------------------------------------------------------------

describe('DELETE /', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    app = buildApp();
    mockDeleteProfile.mockResolvedValue({
      success: true,
      data: { message: 'Voice profile deleted and consents revoked', deletedProfileId: PROFILE_ID },
    });
  });

  afterEach(async () => { await app.close(); });

  it('returns 200 on successful deletion', async () => {
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('returns 401 when not authenticated', async () => {
    const unauthed = buildApp({ isAuthenticated: false, registeredUser: null });
    await unauthed.ready();
    const res = await unauthed.inject({ method: 'DELETE', url: '/' });
    await unauthed.close();
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when service returns failure', async () => {
    mockDeleteProfile.mockResolvedValue({ success: false, error: 'PROFILE_NOT_FOUND' });
    await app.ready();
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(400);
  });
});
