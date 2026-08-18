/**
 * Ce que devient une session anonyme au rechargement de la page.
 *
 * Rejoindre en anonyme se termine par un rechargement de `/chat/:linkId` : la
 * session ne survit que par le `localStorage`. Ce fichier vérifie la jonction
 * entre CE qui est écrit (`authManager`) et CE qui est relu (`checkAuthStatus`,
 * `apiService`) — le point exact où l'identité anonyme se perdait.
 */
import { authManager, AUTH_STORAGE_KEYS } from '@/services/auth-manager.service';
import { checkAuthStatus } from '@/utils/auth';

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: { cleanup: jest.fn() },
}));

const SESSION_TOKEN = 'anon_1755000000000_deadbeefdeadbeef_ab12cd34';

const PARTICIPANT = {
  id: 'part-anon-1',
  username: 'jean_dupont042',
  firstName: 'Jean',
  lastName: 'Dupont',
  language: 'fr',
  isMeeshyer: false,
};

beforeEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('Session anonyme rechargée', () => {
  it('se présente comme anonyme, sans jamais passer par /auth/me', async () => {
    const fetchMock = jest.fn(async (input: any) => {
      const url = String(input);
      if (url.includes('/anonymous/refresh')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { participant: PARTICIPANT } }),
        } as unknown as Response;
      }
      // `/auth/me` refuse un jeton qui n'est pas un JWT — s'y rendre est déjà
      // la panne : la branche anonyme n'est alors plus jamais atteinte.
      return { ok: false, status: 401, json: async () => ({ success: false }) } as unknown as Response;
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    authManager.setAnonymousSession(SESSION_TOKEN, PARTICIPANT.id, 24);

    const state = await checkAuthStatus();

    expect(state).toMatchObject({ isAuthenticated: true, isAnonymous: true, token: SESSION_TOKEN });
    expect(fetchMock.mock.calls.map(([url]) => String(url)).join(' ')).not.toContain('/auth/me');
  });

  // `apiService.request()` juge le jeton stocké AVANT d'émettre : un `anon_…`
  // dans l'emplacement JWT est vu comme expiré, la requête n'est jamais envoyée
  // et l'appelant reçoit « Session expirée, veuillez vous reconnecter ».
  it('ne laisse aucun justificatif que le contrôle d’expiration JWT rejetterait', () => {
    authManager.setAnonymousSession(SESSION_TOKEN, PARTICIPANT.id, 24);

    const stored = localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN);

    expect(stored).toBeNull();
  });
});
