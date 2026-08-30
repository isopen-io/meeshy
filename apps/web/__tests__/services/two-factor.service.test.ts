/**
 * Tests for TwoFactorService
 * Covers all HTTP methods, header injection, code sanitization, credential handoff.
 */

const mockGetAuthToken = jest.fn<string | null, []>(() => 'bearer-token');
const mockSetCredentials = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    setCredentials: (...args: unknown[]) => mockSetCredentials(...args),
  },
}));

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `https://gate.meeshy.me${path}`,
}));

import { twoFactorService } from '@/services/two-factor.service';

const successResponse = (data: unknown) => ({
  json: () => Promise.resolve({ success: true, data }),
});

const errorResponse = () => ({
  json: () => Promise.resolve({ success: false, error: 'bad input' }),
});

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = jest.fn();
});

describe('TwoFactorService.getStatus', () => {
  it('calls GET /auth/2fa/status with auth header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ enabled: true, enabledAt: null, hasBackupCodes: true, backupCodesCount: 8 })
    );

    const result = await twoFactorService.getStatus();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gate.meeshy.me/api/v1/auth/2fa/status',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: 'Bearer bearer-token' }),
      })
    );
    expect(result.success).toBe(true);
    expect(result.data?.enabled).toBe(true);
  });

  it('omits Authorization header when no token', async () => {
    mockGetAuthToken.mockReturnValueOnce(null);
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({ enabled: false }));

    await twoFactorService.getStatus();

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(opts.headers).not.toHaveProperty('Authorization');
  });

  it('returns error response on fetch failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));

    const result = await twoFactorService.getStatus();

    expect(result.success).toBe(false);
    expect(result.error).toContain('Erreur');
  });
});

describe('TwoFactorService.setup', () => {
  it('calls POST /auth/2fa/setup', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ secret: 'SECRET', qrCodeDataUrl: 'data:...', otpauthUrl: 'otpauth://...' })
    );

    const result = await twoFactorService.setup();

    expect(global.fetch).toHaveBeenCalledWith(
      'https://gate.meeshy.me/api/v1/auth/2fa/setup',
      expect.objectContaining({ method: 'POST' })
    );
    expect(result.data?.secret).toBe('SECRET');
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('timeout'));
    const result = await twoFactorService.setup();
    expect(result.success).toBe(false);
  });
});

describe('TwoFactorService.enable', () => {
  it('strips whitespace from the code', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ message: 'ok', backupCodes: ['a', 'b'] })
    );

    await twoFactorService.enable('1 2 3 4 5 6');

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ code: '123456' });
  });

  it('calls POST /auth/2fa/enable', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({}));
    await twoFactorService.enable('123456');
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/2fa/enable');
  });

  it('returns error on failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('bad'));
    const result = await twoFactorService.enable('000000');
    expect(result.success).toBe(false);
  });
});

describe('TwoFactorService.verify', () => {
  // #4419 — cette méthode complète un LOGIN (jeton temporaire
  // `crypto.randomBytes`, jamais un JWT) via la route PUBLIQUE
  // `POST /auth/login/2fa` (`security: []`, corps `{ twoFactorToken, code }`).
  // Elle ne vise plus `POST /auth/2fa/verify`, qui exige un JWT de session
  // (`fastify.authenticate`) que ce jeton temporaire ne peut structurellement
  // pas fournir, et dont le schéma de réponse ne porte de toute façon aucune
  // credential (`{ valid, usedBackupCode }` seulement).
  it('strips spaces and hyphens from code, and sends twoFactorToken alongside it in the body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ user: {}, token: 'new-tok', expiresIn: 3600 })
    );

    await twoFactorService.verify('2fa-temp-token', '12 34-56');

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual({ twoFactorToken: '2fa-temp-token', code: '123456' });
  });

  it('targets POST /auth/login/2fa with the temp token in the BODY, never as a bearer header', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ user: {}, token: 'new-tok', expiresIn: 3600 })
    );

    await twoFactorService.verify('temp-tok-123', '123456');

    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://gate.meeshy.me/api/v1/auth/login/2fa');
    expect(opts.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(opts.body).twoFactorToken).toBe('temp-tok-123');
  });

  it('calls authManager.setCredentials on successful verification', async () => {
    // Forme attendue de la réponse de vérification 2FA (`TwoFactorVerifyResponse`) :
    // `{ user, token, sessionToken?, expiresIn }` — AUCUN `refreshToken`.
    const mockData = {
      user: { id: 'u1', username: 'alice' },
      token: 'full-access-token',
      sessionToken: 'sess',
      expiresIn: 3600,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse(mockData));

    await twoFactorService.verify('temp', '123456');

    // Objet nommé (#4450) : chaque valeur porte son propre champ, il n'y a
    // plus de créneau à confondre.
    expect(mockSetCredentials).toHaveBeenCalledWith({
      user: mockData.user,
      authToken: mockData.token,
      refreshToken: undefined,
      sessionToken: mockData.sessionToken,
      expiresIn: mockData.expiresIn,
    });
  });

  // Le concept `refreshToken` n'est pas retiré par #4404 (c'est #4405) : s'il
  // arrivait un jour du serveur, il doit toujours atterrir dans SON créneau.
  it('threads a refreshToken through to its own slot when the server does send one', async () => {
    const mockData = {
      user: { id: 'u1', username: 'alice' },
      token: 'full-access-token',
      refreshToken: 'refresh-token-xyz',
      sessionToken: 'sess',
      expiresIn: 3600,
    };
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse(mockData));

    await twoFactorService.verify('temp', '123456');

    expect(mockSetCredentials).toHaveBeenCalledWith({
      user: mockData.user,
      authToken: mockData.token,
      refreshToken: mockData.refreshToken,
      sessionToken: mockData.sessionToken,
      expiresIn: mockData.expiresIn,
    });
  });

  it('does not call setCredentials when verification fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(errorResponse());
    await twoFactorService.verify('temp', 'wrong');
    expect(mockSetCredentials).not.toHaveBeenCalled();
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network'));
    const result = await twoFactorService.verify('temp', '000000');
    expect(result.success).toBe(false);
  });
});

describe('TwoFactorService.disable', () => {
  it('sends password in body', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({ message: 'disabled' }));

    await twoFactorService.disable('p@ssw0rd');

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.password).toBe('p@ssw0rd');
    expect(body.code).toBeUndefined();
  });

  it('includes code when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({ message: 'disabled' }));

    await twoFactorService.disable('pass', '654321');

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.code).toBe('654321');
  });

  it('strips whitespace from code when provided', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({ message: 'ok' }));

    await twoFactorService.disable('pass', '6 5 4 3 2 1');

    const [, opts] = (global.fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(opts.body).code).toBe('654321');
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('net'));
    const result = await twoFactorService.disable('pass');
    expect(result.success).toBe(false);
  });
});

describe('TwoFactorService.regenerateBackupCodes', () => {
  it('calls POST /auth/2fa/backup-codes', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      successResponse({ backupCodes: ['a', 'b', 'c'] })
    );

    const result = await twoFactorService.regenerateBackupCodes();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/2fa/backup-codes');
    expect(result.data?.backupCodes).toHaveLength(3);
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('net'));
    const result = await twoFactorService.regenerateBackupCodes();
    expect(result.success).toBe(false);
  });
});

describe('TwoFactorService.cancelSetup', () => {
  it('calls POST /auth/2fa/cancel', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(successResponse({}));

    const result = await twoFactorService.cancelSetup();

    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/auth/2fa/cancel');
    expect(result.success).toBe(true);
  });

  it('returns error on network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('net'));
    const result = await twoFactorService.cancelSetup();
    expect(result.success).toBe(false);
  });
});
