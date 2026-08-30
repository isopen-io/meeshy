/**
 * Bout-en-bout #4419 — TwoFactorService.verify() complète une connexion,
 * pas une confirmation post-session.
 *
 * `two-factor.service.test.ts` (fichier voisin) mocke `authManager` : il
 * prouve la FORME de l'appel à `setCredentials`, jamais son EFFET. Et un
 * `global.fetch` mocké sans discriminer l'URL reçue ne prouve rien sur la
 * route réellement visée — `auth-credential-slots-persistence.test.ts` (qui
 * n'est pas mocké non plus côté `authManager`) persiste déjà son état AVEC
 * le code fautif, précisément parce que son mock répond identiquement quelle
 * que soit l'URL appelée.
 *
 * Ce fichier fait les DEUX à la fois :
 *  - `authManager` n'est PAS mocké : le vrai `AuthManager` écrit dans le vrai
 *    `localStorage` (jsdom), et c'est CETTE valeur qui est relue.
 *  - le mock de `fetch` rejoue les DEUX contrats serveur réels, discriminés
 *    par URL :
 *      · `POST /api/v1/auth/2fa/verify` (`services/gateway/src/routes/two-factor.ts`)
 *        exige un JWT de session et ne rend jamais que `{ valid, usedBackupCode }`
 *        — jamais de credentials.
 *      · `POST /api/v1/auth/login/2fa` (`services/gateway/src/routes/auth/login.ts`)
 *        est la route PUBLIQUE qui authentifie le jeton temporaire et rend la
 *        session complète.
 *
 * Sous le code fautif (#4419), `verify()` vise la première : aucune
 * credential n'atterrit jamais dans `localStorage`, quel que soit le code
 * entré — la garde `data.data?.token` du service est infalsifiable.
 */
import { authManager, AUTH_STORAGE_KEYS } from '@/services/auth-manager.service';
import { twoFactorService } from '@/services/two-factor.service';

jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `https://gate.meeshy.me${path}`,
}));

const LOGIN_2FA_URL = 'https://gate.meeshy.me/api/v1/auth/login/2fa';
const SESSION_2FA_VERIFY_URL = 'https://gate.meeshy.me/api/v1/auth/2fa/verify';

function jsonResponse(body: unknown) {
  return { json: () => Promise.resolve(body) };
}

const fullSessionUser = {
  id: 'u-42',
  username: 'alice',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'A',
  displayName: 'Alice A',
  role: 'USER',
  systemLanguage: 'fr',
};

/**
 * Émule les DEUX contrats serveur réels, distingués par URL — jamais un
 * `mockResolvedValueOnce` unique et agnostique de l'adresse appelée.
 */
function mockGatewayFor2FA() {
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url === LOGIN_2FA_URL) {
      // Forme réelle de POST /login/2fa — services/gateway/src/routes/auth/login.ts:223-239
      return Promise.resolve(jsonResponse({
        success: true,
        data: {
          user: fullSessionUser,
          token: 'full-jwt-access-token',
          sessionToken: 'real-session-token',
          session: { id: 'sess-1' },
          expiresIn: 86400,
        },
      }));
    }
    if (url === SESSION_2FA_VERIFY_URL) {
      // Forme réelle de POST /2fa/verify — services/gateway/src/routes/two-factor.ts:263-270.
      // En pratique inatteignable sans JWT de session valide (`fastify.authenticate`
      // rendrait 401 avant ce corps) — simulé ici au plus généreux pour le code
      // fautif, qui ne l'atteint jamais en production avec un jeton temporaire.
      return Promise.resolve(jsonResponse({
        success: true,
        data: { valid: true, usedBackupCode: false },
      }));
    }
    return Promise.reject(new Error(`Unexpected fetch to ${url}`));
  });
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn();
});

describe('TwoFactorService.verify() — session posée après complétion du login (#4419)', () => {
  it('persists the real session in localStorage after a successful code', async () => {
    mockGatewayFor2FA();

    const result = await twoFactorService.verify('temp-2fa-token', '123456');

    expect(result.success).toBe(true);
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBe('full-jwt-access-token');
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.SESSION_TOKEN)).toBe('real-session-token');
    expect(JSON.parse(localStorage.getItem(AUTH_STORAGE_KEYS.USER_DATA) || 'null')).toEqual(fullSessionUser);
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('calls POST /auth/login/2fa, never POST /auth/2fa/verify', async () => {
    mockGatewayFor2FA();

    await twoFactorService.verify('temp-2fa-token', '123456');

    expect(global.fetch).toHaveBeenCalledWith(LOGIN_2FA_URL, expect.anything());
    expect(global.fetch).not.toHaveBeenCalledWith(SESSION_2FA_VERIFY_URL, expect.anything());
  });

  it('does not persist any credentials when the server rejects the code', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === LOGIN_2FA_URL) {
        return Promise.resolve(jsonResponse({ success: false, error: 'Code 2FA invalide' }));
      }
      return Promise.reject(new Error(`Unexpected fetch to ${url}`));
    });

    const result = await twoFactorService.verify('temp-2fa-token', '000000');

    expect(result.success).toBe(false);
    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    expect(authManager.isAuthenticated()).toBe(false);
  });
});
