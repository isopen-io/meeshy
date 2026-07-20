jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://localhost:3000${path}`,
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: { setCredentials: jest.fn() },
}));

import { magicLinkService } from '@/services/magic-link.service';
import { authManager } from '@/services/auth-manager.service';

const mockAuthManager = authManager as jest.Mocked<typeof authManager>;

function makeResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: jest.fn().mockResolvedValue(body) };
}

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn() as jest.Mock;
  Object.defineProperty(global, 'navigator', {
    value: { userAgent: 'test-agent', language: 'fr', platform: 'test-platform' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, 'screen', {
    value: { width: 1920, height: 1080, colorDepth: 24 },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(global, 'Intl', {
    value: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'Europe/Paris' }) }) },
    configurable: true,
    writable: true,
  });
  (global as Record<string, unknown>).btoa = (str: string) => Buffer.from(str).toString('base64');
});

afterEach(() => {
  delete (global as Record<string, unknown>).fetch;
});

// ─── requestMagicLink ─────────────────────────────────────────────────────────

describe('magicLinkService.requestMagicLink', () => {
  it('POSTs to /auth/magic-link/request with lowercase trimmed email', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true }));

    await magicLinkService.requestMagicLink('  ALICE@example.com  ');

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/auth/magic-link/request');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.email).toBe('alice@example.com');
  });

  it('passes rememberDevice in request body', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true }));

    await magicLinkService.requestMagicLink('alice@example.com', true);

    const body = JSON.parse(((global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.rememberDevice).toBe(true);
  });

  it('returns server response on success', async () => {
    const serverResponse = { success: true, message: 'Email sent' };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(serverResponse));

    const result = await magicLinkService.requestMagicLink('alice@example.com');

    expect(result).toEqual(serverResponse);
  });

  it('returns error object instead of throwing on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));

    const result = await magicLinkService.requestMagicLink('alice@example.com');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Erreur de connexion au serveur');
  });

  it('uses default rememberDevice=false', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: true }));

    await magicLinkService.requestMagicLink('alice@example.com');

    const body = JSON.parse(((global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.rememberDevice).toBe(false);
  });
});

// ─── validateMagicLink ────────────────────────────────────────────────────────

describe('magicLinkService.validateMagicLink', () => {
  it('POSTs to /auth/magic-link/validate with token', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: false }));

    await magicLinkService.validateMagicLink('tok-abc');

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:3000/auth/magic-link/validate');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.token).toBe('tok-abc');
  });

  it('calls authManager.setCredentials on success when no 2FA required', async () => {
    const user = { id: 'u1', username: 'alice' };
    const data = {
      success: true,
      data: {
        user,
        token: 'jwt-token',
        sessionToken: 'sess-token',
        expiresIn: 3600,
        requires2FA: false,
      },
    };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(data));

    await magicLinkService.validateMagicLink('tok-abc');

    expect(mockAuthManager.setCredentials).toHaveBeenCalledWith(
      user, 'jwt-token', 'sess-token', 3600
    );
  });

  it('does NOT call setCredentials when requires2FA is true', async () => {
    const data = {
      success: true,
      data: {
        user: { id: 'u1' },
        token: 'jwt-token',
        sessionToken: 'sess',
        expiresIn: 3600,
        requires2FA: true,
        twoFactorToken: '2fa-tok',
      },
    };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(data));

    await magicLinkService.validateMagicLink('tok-abc');

    expect(mockAuthManager.setCredentials).not.toHaveBeenCalled();
  });

  it('does NOT call setCredentials when success=false', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse({ success: false, error: 'Expired' }));

    await magicLinkService.validateMagicLink('bad-token');

    expect(mockAuthManager.setCredentials).not.toHaveBeenCalled();
  });

  it('returns error object instead of throwing on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('timeout'));

    const result = await magicLinkService.validateMagicLink('tok-abc');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Erreur de connexion au serveur');
  });

  it('returns server data on success', async () => {
    const data = { success: true, data: { token: 'jwt' } };
    (global.fetch as jest.Mock).mockResolvedValue(makeResponse(data));

    const result = await magicLinkService.validateMagicLink('tok');

    expect(result).toEqual(data);
  });
});
