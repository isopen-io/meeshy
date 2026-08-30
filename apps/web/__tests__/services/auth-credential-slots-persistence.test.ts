/**
 * Ce que `localStorage` contient RÉELLEMENT après login, lien magique ou 2FA —
 * pas ce qu'un double a reçu comme arguments (#4404).
 *
 * `AuthManager.setCredentials(user, authToken, refreshToken?, sessionToken?,
 * expiresIn?)` a cinq créneaux positionnels, trois `string | undefined`
 * indiscernables au typage. Un témoin qui mocke `authManager` et relit les
 * arguments passés au mock peut geler un appel dans le mauvais ordre sans
 * jamais le voir — c'est exactement ce qui s'est produit sur les trois sites
 * (`services/auth.service.ts`, `magic-link.service.ts`, `two-factor.service.ts`).
 * `authManager` n'est donc PAS mocké ici : ce fichier appelle le service réel,
 * qui appelle le vrai `AuthManager`, qui écrit dans le vrai `localStorage`
 * (jsdom) — puis relit la clé qui compte.
 *
 * Sous le code fautif, `SESSION_TOKEN` finit par contenir soit `'3600'` (le
 * nombre `expiresIn` glissé dans le créneau sessionToken — login), soit rien
 * du tout tandis que `REFRESH_TOKEN` porte le vrai jeton de session (lien
 * magique, 2FA — double décalage).
 */
import { AUTH_STORAGE_KEYS } from '@/services/auth-manager.service';
import { authService } from '@/services/auth.service';
import { magicLinkService } from '@/services/magic-link.service';
import { twoFactorService } from '@/services/two-factor.service';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { cleanup: jest.fn() },
}));

jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) };
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
  // Requis par magicLinkService.getDeviceFingerprint()
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

describe('authService.login() — clé persistée', () => {
  it('écrit le sessionToken réel du serveur sous SESSION_TOKEN, jamais sous 3600', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        user: { id: 'user-1', username: 'alice' },
        token: 'jwt-token',
        // Forme réelle de POST /auth/login (branche hors-2FA) : AUCUN
        // refreshToken (#4405, mesuré).
        sessionToken: 'server-session-token',
        expiresIn: 86400,
      },
    }));

    await authService.login('alice', 'pw');

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('server-session-token');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('jwt-token');
    // Le défaut mesuré : `expiresIn` (nombre) glissé dans le créneau
    // sessionToken — la clé aurait alors contenu la chaîne '86400'.
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).not.toBe('86400');
  });
});

describe('magicLinkService.validateMagicLink() — clé persistée', () => {
  // Le défaut mesuré par #4404 (sessionToken atterrissant sous l'ancienne
  // clé REFRESH_TOKEN) n'est plus testable tel quel : cette clé a été
  // retirée (#4405, étape 3, aucune route ne l'ayant jamais produite). La
  // seule assertion qui reste significative est positive — SESSION_TOKEN
  // porte bien la vraie valeur serveur.
  it('écrit le sessionToken réel du serveur sous SESSION_TOKEN', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        user: { id: 'user-1', username: 'alice' },
        token: 'jwt-token',
        sessionToken: 'server-session-token',
        session: { id: 'sess-1' },
        expiresIn: 86400,
      },
    }));

    await magicLinkService.validateMagicLink('magic-tok');

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('server-session-token');
  });
});

describe('twoFactorService.verify() — clé persistée', () => {
  it('écrit le sessionToken réel du serveur sous SESSION_TOKEN', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({
      success: true,
      data: {
        user: { id: 'user-1', username: 'alice' },
        token: 'jwt-token',
        sessionToken: 'server-session-token',
        expiresIn: 86400,
      },
    }));

    await twoFactorService.verify('2fa-temp-token', '123456');

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('server-session-token');
  });
});
