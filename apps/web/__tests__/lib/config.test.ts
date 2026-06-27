/**
 * Tests for lib/config.ts
 *
 * Because config.ts uses window.location in browser mode (jsdom sets window),
 * we control getBackendUrl/getWebSocketUrl via NEXT_PUBLIC_BACKEND_URL /
 * NEXT_PUBLIC_WS_URL env vars (the explicit-env branch runs before hostname logic).
 */

import {
  API_VERSION,
  API_PATH,
  isDevelopment,
  isProduction,
  buildApiUrl,
  buildGatewayUrl,
  buildWsUrl,
  buildWebSocketUrl,
  API_ENDPOINTS,
  APP_CONFIG,
  config,
} from '@/lib/config';

// ─── Constants ────────────────────────────────────────────────────────────────

describe('API constants', () => {
  it('API_VERSION is v1', () => {
    expect(API_VERSION).toBe('v1');
  });

  it('API_PATH is /api/v1', () => {
    expect(API_PATH).toBe('/api/v1');
  });
});

describe('environment flags', () => {
  it('isDevelopment reflects NODE_ENV', () => {
    // In Jest, NODE_ENV is "test" by default
    expect(typeof isDevelopment).toBe('boolean');
    expect(isDevelopment).toBe(process.env.NODE_ENV === 'development');
  });

  it('isProduction reflects NODE_ENV', () => {
    expect(typeof isProduction).toBe('boolean');
    expect(isProduction).toBe(process.env.NODE_ENV === 'production');
  });
});

// ─── config object ────────────────────────────────────────────────────────────

describe('config object', () => {
  it('has frontend, backend, translation, database, redis, jwt, languages, env, cors', () => {
    expect(config).toHaveProperty('frontend');
    expect(config).toHaveProperty('backend');
    expect(config).toHaveProperty('translation');
    expect(config).toHaveProperty('database');
    expect(config).toHaveProperty('redis');
    expect(config).toHaveProperty('jwt');
    expect(config).toHaveProperty('languages');
    expect(config).toHaveProperty('env');
    expect(config).toHaveProperty('cors');
  });

  it('languages.supported is a non-empty array', () => {
    expect(Array.isArray(config.languages.supported)).toBe(true);
    expect(config.languages.supported.length).toBeGreaterThan(0);
  });

  it('languages.default is a string', () => {
    expect(typeof config.languages.default).toBe('string');
    expect(config.languages.default.length).toBeGreaterThan(0);
  });
});

// ─── buildApiUrl ──────────────────────────────────────────────────────────────

describe('buildApiUrl', () => {
  const saved = {
    backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
    wsUrl: process.env.NEXT_PUBLIC_WS_URL,
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://gate.test.me';
    // Clear runtime placeholder to force env branch
    delete process.env.NEXT_PUBLIC_WS_URL;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = saved.backendUrl;
    process.env.NEXT_PUBLIC_WS_URL = saved.wsUrl;
  });

  it('prepends /api/v1 for a plain endpoint', () => {
    const url = buildApiUrl('/dashboard');
    expect(url).toBe('https://gate.test.me/api/v1/dashboard');
  });

  it('adds leading slash when endpoint does not have one', () => {
    const url = buildApiUrl('users/123');
    expect(url).toBe('https://gate.test.me/api/v1/users/123');
  });

  it('does NOT add /api/v1 for endpoint already starting with /api/v', () => {
    const url = buildApiUrl('/api/v2/something');
    expect(url).toBe('https://gate.test.me/api/v2/something');
  });

  it('replaces /api/ with /api/v1/ for endpoint starting with /api/ without version', () => {
    const url = buildApiUrl('/api/health');
    expect(url).toContain('/api/v1/health');
  });

  it('works with deeply nested paths', () => {
    const url = buildApiUrl('/conversations/abc123/messages');
    expect(url).toBe('https://gate.test.me/api/v1/conversations/abc123/messages');
  });
});

// ─── buildGatewayUrl ──────────────────────────────────────────────────────────

describe('buildGatewayUrl', () => {
  const savedBackend = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://gate.test.me';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = savedBackend;
  });

  it('prepends backend URL without /api prefix', () => {
    // Import dynamically to avoid module-level cache issues
    const { buildGatewayUrl: fn } = require('@/lib/config');
    const url = fn('/health');
    expect(url).toBe('https://gate.test.me/health');
  });

  it('adds leading slash when missing', () => {
    const { buildGatewayUrl: fn } = require('@/lib/config');
    const url = fn('health');
    expect(url).toBe('https://gate.test.me/health');
  });
});

// ─── buildWsUrl / buildWebSocketUrl ───────────────────────────────────────────

describe('buildWsUrl', () => {
  const savedWs = process.env.NEXT_PUBLIC_WS_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_WS_URL = 'wss://gate.test.me';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_WS_URL = savedWs;
  });

  it('defaults to /socket.io/ path', () => {
    const url = buildWsUrl();
    expect(url).toContain('/socket.io/');
  });

  it('accepts custom path', () => {
    const url = buildWsUrl('/my-socket');
    expect(url).toContain('/my-socket');
  });

  it('buildWebSocketUrl is an alias for buildWsUrl', () => {
    expect(buildWebSocketUrl()).toBe(buildWsUrl());
  });
});

// ─── API_ENDPOINTS ────────────────────────────────────────────────────────────

describe('API_ENDPOINTS', () => {
  it('AUTH endpoints are defined', () => {
    expect(API_ENDPOINTS.AUTH.LOGIN).toBe('/auth/login');
    expect(API_ENDPOINTS.AUTH.REGISTER).toBe('/auth/register');
    expect(API_ENDPOINTS.AUTH.ME).toBe('/auth/me');
    expect(API_ENDPOINTS.AUTH.LOGOUT).toBe('/auth/logout');
  });

  it('CONVERSATION.LIST and CREATE are /conversations', () => {
    expect(API_ENDPOINTS.CONVERSATION.LIST).toBe('/conversations');
    expect(API_ENDPOINTS.CONVERSATION.CREATE).toBe('/conversations');
  });

  it('CONVERSATION dynamic endpoints return correct paths', () => {
    expect(API_ENDPOINTS.CONVERSATION.GET_GROUP_CONVERSATIONS('g1')).toBe('/conversations/group/g1');
    expect(API_ENDPOINTS.CONVERSATION.CHECK_IDENTIFIER('abc')).toBe('/conversations/check-identifier/abc');
  });

  it('GROUP dynamic endpoints return correct paths', () => {
    expect(API_ENDPOINTS.GROUP.DETAILS('g1')).toBe('/communities/g1');
    expect(API_ENDPOINTS.GROUP.MEMBERS('g1')).toBe('/communities/g1/members');
    expect(API_ENDPOINTS.GROUP.UPDATE('g1')).toBe('/communities/g1');
    expect(API_ENDPOINTS.GROUP.REMOVE_MEMBER('g1', 'm1')).toBe('/communities/g1/members/m1');
    expect(API_ENDPOINTS.GROUP.UPDATE_MEMBER_ROLE('g1', 'm1')).toBe('/communities/g1/members/m1/role');
  });

  it('TRACKING_LINK dynamic endpoints return correct paths', () => {
    expect(API_ENDPOINTS.TRACKING_LINK.CLICK('tok')).toBe('/api/tracking-links/tok/click');
    expect(API_ENDPOINTS.TRACKING_LINK.GET('tok')).toBe('/api/tracking-links/tok');
    expect(API_ENDPOINTS.TRACKING_LINK.REDIRECT('tok')).toBe('/l/tok');
    expect(API_ENDPOINTS.TRACKING_LINK.STATS('tok')).toBe('/api/tracking-links/tok/stats');
    expect(API_ENDPOINTS.TRACKING_LINK.DEACTIVATE('tok')).toBe('/api/tracking-links/tok/deactivate');
    expect(API_ENDPOINTS.TRACKING_LINK.DELETE('tok')).toBe('/api/tracking-links/tok');
  });
});

// ─── APP_CONFIG ───────────────────────────────────────────────────────────────

describe('APP_CONFIG', () => {
  it('FRONTEND_URL is a string', () => {
    expect(typeof APP_CONFIG.FRONTEND_URL).toBe('string');
    expect(APP_CONFIG.FRONTEND_URL.length).toBeGreaterThan(0);
  });

  it('BACKEND_URL is a string', () => {
    expect(typeof APP_CONFIG.BACKEND_URL).toBe('string');
    expect(APP_CONFIG.BACKEND_URL.length).toBeGreaterThan(0);
  });

  it('FRONTEND_PORT is a number', () => {
    expect(typeof APP_CONFIG.FRONTEND_PORT).toBe('number');
  });

  it('BACKEND_PORT is a number', () => {
    expect(typeof APP_CONFIG.BACKEND_PORT).toBe('number');
  });

  it('getBackendUrl() returns a string', () => {
    expect(typeof APP_CONFIG.getBackendUrl()).toBe('string');
  });

  it('getFrontendUrl() returns a string', () => {
    expect(typeof APP_CONFIG.getFrontendUrl()).toBe('string');
  });

  it('getWebSocketUrl() returns a string', () => {
    expect(typeof APP_CONFIG.getWebSocketUrl()).toBe('string');
  });
});
