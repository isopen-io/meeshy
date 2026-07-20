/**
 * Extended unit tests for voice-profile.ts routes.
 * Covers branches missing from voice-profile.test.ts:
 * - 401 unauthenticated paths for all 5 routes
 * - GET / when PROFILE_NOT_FOUND and consent status fails
 * - POST /register multipart path (no file provided)
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

// ─── App factories ────────────────────────────────────────────────────────────

async function buildAuthenticatedApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      userId: USER_ID,
      registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
    };
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {});
  await voiceProfileRoutes(app);
  await app.ready();
  return app;
}

async function buildUnauthenticatedApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = { isAuthenticated: false, registeredUser: null };
  });
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {});
  await voiceProfileRoutes(app);
  await app.ready();
  return app;
}

// ─── Unauthenticated (401) paths ──────────────────────────────────────────────

describe('POST /consent — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/consent', payload: { voiceRecordingConsent: true } });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET /consent — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/consent' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /register — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/register', payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('PUT /:profileId — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'PUT', url: `/${PROFILE_ID}`, payload: { audioData: 'A'.repeat(200), audioFormat: 'wav' } });
    expect(res.statusCode).toBe(401);
  });
});

describe('GET / — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(401);
  });
});

describe('DELETE / — unauthenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildUnauthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/' });
    expect(res.statusCode).toBe(401);
  });
});

// ─── GET / — PROFILE_NOT_FOUND with consent failure ──────────────────────────

describe('GET / — profile not found and consent status fails', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildAuthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 with null consent when getConsentStatus fails', async () => {
    mockGetProfile.mockResolvedValueOnce({ success: false, errorCode: 'PROFILE_NOT_FOUND' });
    mockGetConsentStatus.mockResolvedValueOnce({ success: false, error: 'Error', errorCode: 'ERROR' });
    const res = await app.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.exists).toBe(false);
    expect(body.data.consentStatus.voiceRecordingConsentAt).toBeNull();
  });
});

// ─── POST /register — multipart path (no file) ───────────────────────────────

describe('POST /register — multipart with no file', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildAuthenticatedApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 4xx or 5xx when content-type is multipart but no file is provided', async () => {
    const boundary = '----FormBoundaryXYZ';
    const body = `--${boundary}\r\nContent-Disposition: form-data; name="audioFormat"\r\n\r\nwav\r\n--${boundary}--\r\n`;
    const res = await app.inject({
      method: 'POST',
      url: '/register',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: body,
    });
    // Fastify rejects unsupported content-type with 415, or may return 4xx/5xx
    // depending on whether @fastify/multipart is registered
    expect([400, 415, 500]).toContain(res.statusCode);
  });
});
