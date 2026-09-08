import { authManager } from '@/services/auth-manager.service';
import { AUTH_STORAGE_KEYS } from '@/constants/auth';

/**
 * Le legacy vérifiait l'échéance des seules sessions ANONYMES
 * (`getAnonymousSession`). Un JWT authentifié expiré restait servi, et la
 * socket le rouvrait : côté serveur, `AuthHandler` écrit alors
 * `User.lastActiveAt`, et une personne absente depuis des mois paraît présente.
 *
 * Mesuré le 2026-09-08 — `La_mignonne`, utilisatrice du legacy : activité il y
 * a 148 min, DEUX sessions expirées depuis 62 jours, aucun message jamais
 * envoyé (#5712). La v3.1 porte déjà cette garde
 * (`persisted.expiresAt <= now()`), le legacy ne l'avait pas.
 */
const jwtAvecExp = (expSecondes: number): string => {
  const payload = Buffer.from(JSON.stringify({ sub: 'u1', exp: expSecondes })).toString('base64url');
  return `entete.${payload}.signature`;
};

describe('authManager — un JWT authentifié expiré n\'est plus servi', () => {
  beforeEach(() => localStorage.clear());

  it('rend null quand le jeton a expiré', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, jwtAvecExp(Math.floor(Date.now() / 1000) - 60));

    expect(authManager.getAuthToken()).toBeNull();
    expect(authManager.isAuthenticated()).toBe(false);
  });

  it('NETTOIE le stockage plutôt que de laisser un jeton mort traîner', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, jwtAvecExp(Math.floor(Date.now() / 1000) - 60));

    authManager.getAuthToken();

    expect(localStorage.getItem(AUTH_STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
  });

  it('sert un jeton encore valide', () => {
    const token = jwtAvecExp(Math.floor(Date.now() / 1000) + 3600);
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, token);

    expect(authManager.getAuthToken()).toBe(token);
    expect(authManager.isAuthenticated()).toBe(true);
  });

  it('sert un jeton SANS exp — on ne jette que ce qu\'on sait périmé', () => {
    const token = `entete.${Buffer.from(JSON.stringify({ sub: 'u1' })).toString('base64url')}.signature`;
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, token);

    expect(authManager.getAuthToken()).toBe(token);
  });

  it('sert un jeton illisible sans le jeter — le serveur reste l\'autorité', () => {
    localStorage.setItem(AUTH_STORAGE_KEYS.AUTH_TOKEN, 'pas-un-jwt');

    expect(authManager.getAuthToken()).toBe('pas-un-jwt');
  });
});
