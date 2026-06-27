/**
 * Tests for utils/websocket-diagnostics.ts
 */

const mockGetAuthToken = jest.fn();
const mockGetAnonymousSession = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

// Stores is required() inside the function — mock via jest module registry
jest.mock('@/stores', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ user: null })),
  },
}));

// Socket service is also required() inside the function
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getConnectionStatus: jest.fn(() => ({ isConnected: false, hasSocket: false })),
    getSocket: jest.fn(() => null),
  },
}));

jest.mock('@/lib/config', () => ({
  getWebSocketUrl: jest.fn(() => 'ws://localhost:3000'),
}));

import { getWebSocketDiagnostics, printWebSocketDiagnostics, useWebSocketDiagnostics } from '@/utils/websocket-diagnostics';

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAuthToken.mockReturnValue(null);
  mockGetAnonymousSession.mockReturnValue(null);

  const { useAuthStore } = require('@/stores');
  useAuthStore.getState.mockReturnValue({ user: null });

  const { meeshySocketIOService } = require('@/services/meeshy-socketio.service');
  meeshySocketIOService.getConnectionStatus.mockReturnValue({ isConnected: false, hasSocket: false });
  meeshySocketIOService.getSocket.mockReturnValue(null);
});

// ─── getWebSocketDiagnostics structure ────────────────────────────────────────

describe('getWebSocketDiagnostics', () => {
  it('returns a diagnostics object with all required fields', () => {
    const d = getWebSocketDiagnostics();
    expect(d).toHaveProperty('timestamp');
    expect(d).toHaveProperty('userState');
    expect(d).toHaveProperty('tokens');
    expect(d).toHaveProperty('socketState');
    expect(d).toHaveProperty('configuration');
    expect(d).toHaveProperty('recommendations');
  });

  it('timestamp is an ISO string', () => {
    const d = getWebSocketDiagnostics();
    expect(() => new Date(d.timestamp)).not.toThrow();
  });

  it('recommendations is an array', () => {
    const d = getWebSocketDiagnostics();
    expect(Array.isArray(d.recommendations)).toBe(true);
  });
});

// ─── user state ───────────────────────────────────────────────────────────────

describe('userState', () => {
  it('hasUser=false and adds recommendation when no user in store', () => {
    const d = getWebSocketDiagnostics();
    expect(d.userState.hasUser).toBe(false);
    expect(d.userState.userId).toBeNull();
    expect(d.userState.username).toBeNull();
    expect(d.recommendations.some(r => r.includes('utilisateur'))).toBe(true);
  });

  it('hasUser=true when user is in store', () => {
    const { useAuthStore } = require('@/stores');
    useAuthStore.getState.mockReturnValue({ user: { id: 'u1', username: 'alice' } });

    const d = getWebSocketDiagnostics();
    expect(d.userState.hasUser).toBe(true);
    expect(d.userState.userId).toBe('u1');
    expect(d.userState.username).toBe('alice');
  });
});

// ─── token state ──────────────────────────────────────────────────────────────

describe('tokens', () => {
  it('hasAuthToken=false when no auth token', () => {
    const d = getWebSocketDiagnostics();
    expect(d.tokens.hasAuthToken).toBe(false);
  });

  it('adds "no token" recommendation when both tokens are absent', () => {
    const d = getWebSocketDiagnostics();
    expect(d.recommendations.some(r => r.includes('token') || r.includes('Token'))).toBe(true);
  });

  it('hasSessionToken=true when anonymous session token is present', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'session-tok-123456789' });
    const d = getWebSocketDiagnostics();
    expect(d.tokens.hasSessionToken).toBe(true);
    expect(d.tokens.sessionTokenPreview).toContain('session-tok');
  });

  it('sets authTokenPreview for valid auth token', () => {
    // A minimal valid-looking JWT (header.payload.signature)
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const token = `${header}.${payload}.sig`;
    mockGetAuthToken.mockReturnValue(token);

    const d = getWebSocketDiagnostics();
    expect(d.tokens.hasAuthToken).toBe(true);
    expect(d.tokens.authTokenPreview).toBeTruthy();
    expect(d.tokens.authTokenValid).toBe(true);
  });

  it('marks authTokenValid=false for an expired JWT', () => {
    const header = btoa(JSON.stringify({ alg: 'HS256' }));
    const payload = btoa(JSON.stringify({ exp: 1 })); // expired in 1970
    const token = `${header}.${payload}.sig`;
    mockGetAuthToken.mockReturnValue(token);

    const d = getWebSocketDiagnostics();
    expect(d.tokens.authTokenValid).toBe(false);
    expect(d.recommendations.some(r => r.includes('expiré') || r.includes('expir'))).toBe(true);
  });
});

// ─── socket state ─────────────────────────────────────────────────────────────

describe('socketState', () => {
  it('hasSocket=false when socket service reports no socket', () => {
    const d = getWebSocketDiagnostics();
    expect(d.socketState.hasSocket).toBe(false);
  });

  it('adds recommendation when socket is not created', () => {
    const d = getWebSocketDiagnostics();
    expect(d.recommendations.some(r => r.includes('Socket') || r.includes('socket'))).toBe(true);
  });

  it('socketId is set when socket is connected with an id', () => {
    const { meeshySocketIOService } = require('@/services/meeshy-socketio.service');
    meeshySocketIOService.getConnectionStatus.mockReturnValue({ isConnected: true, hasSocket: true });
    meeshySocketIOService.getSocket.mockReturnValue({ id: 'socket-abc' });

    const d = getWebSocketDiagnostics();
    expect(d.socketState.socketId).toBe('socket-abc');
  });
});

// ─── configuration ────────────────────────────────────────────────────────────

describe('configuration', () => {
  it('sets serverUrl from getWebSocketUrl', () => {
    const d = getWebSocketDiagnostics();
    expect(d.configuration.serverUrl).toBe('ws://localhost:3000');
  });

  it('isPublicPath=false for a non-public path', () => {
    const d = getWebSocketDiagnostics();
    expect(d.configuration.isPublicPath).toBe(false);
  });
});

// ─── printWebSocketDiagnostics ────────────────────────────────────────────────

describe('printWebSocketDiagnostics', () => {
  it('does not throw', () => {
    expect(() => printWebSocketDiagnostics()).not.toThrow();
  });
});

// ─── useWebSocketDiagnostics ──────────────────────────────────────────────────

describe('useWebSocketDiagnostics', () => {
  it('returns an object with getDiagnostics and printDiagnostics in browser', () => {
    const result = useWebSocketDiagnostics();
    expect(result).not.toBeNull();
    expect(typeof result?.getDiagnostics).toBe('function');
    expect(typeof result?.printDiagnostics).toBe('function');
  });

  it('getDiagnostics returns a valid diagnostics object', () => {
    const result = useWebSocketDiagnostics();
    const d = result?.getDiagnostics();
    expect(d).toHaveProperty('recommendations');
  });
});
