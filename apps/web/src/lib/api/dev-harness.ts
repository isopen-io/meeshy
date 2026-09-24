import { auth } from './auth';
import { httpTransport } from './client';
import { sessionStore } from './session';

/**
 * LE HARNAIS DE RECETTE (#5605, § 7) — le SEUL contrôle manuel de ce tour.
 *
 * Aucun écran de connexion n'existe encore (Features/Auth est un travail à
 * part) : ce module expose `window.meeshy` pour que la recette Chrome local
 * (§ 7.3 de la spécification) puisse appeler `login()`/`logout()` depuis la
 * console sans en écrire un. `request` y expose le transport PARTAGÉ — c'est
 * ce qui permet de prouver « la session est tenue » après un rechargement
 * (`await meeshy.request({ method: 'GET', path: '/api/v1/me' })`,
 * `services/gateway/src/routes/me/index.ts:42`) sans écrire d'écran non plus.
 *
 * MORT EN PRODUCTION. `main.tsx` ne l'importe que sous
 * `if (import.meta.env.DEV)` — `import.meta.env.DEV` est un LITTÉRAL à la
 * construction (même mécanique que `__BENCH__`/`__SHELL__`), donc la branche
 * entière — l'`import()` compris — est éliminée du bundle de production :
 * `grep dev-harness dist/assets/*.js` rend vide sur un build normal (mesure
 * listée dans le rapport de livraison).
 */
window.meeshy = {
  login: auth.login,
  completeTwoFactor: auth.completeTwoFactor,
  logout: auth.logout,
  request: httpTransport.request,
  session: sessionStore,
};

declare global {
  interface Window {
    meeshy?: {
      readonly login: typeof auth.login;
      readonly completeTwoFactor: typeof auth.completeTwoFactor;
      readonly logout: typeof auth.logout;
      readonly request: typeof httpTransport.request;
      readonly session: typeof sessionStore;
    };
  }
}
