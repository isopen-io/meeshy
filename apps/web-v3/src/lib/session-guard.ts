import type { SessionState } from './api/session';

/**
 * LA GARDE DE ROUTE (#5555, E6) — pure. Elle décide, elle ne navigue pas :
 * `main.tsx` (`SessionGate`) applique la décision, ce module ne connaît ni le
 * routeur ni le DOM.
 *
 * Deux familles de routes, symétriques : les routes PRIVÉES (`list`,
 * `thread`, `progression`) exigent une session — un visiteur SANS COMPTE en est sorti (D-6,
 * même doctrine que `/c/`) ; les routes d'AUTHENTIFICATION (`login`,
 * `signup`) refusent une session déjà ACTIVE — s'y présenter connecté n'a pas
 * de sens produit et renvoie vers `/`. Toute autre route (inconnue, ou future)
 * est publique et neutre : `allow`.
 *
 * `pending2fa` reste `allow` sur `login` : c'est l'écran où vit la section
 * deux-facteurs (`normalLoginSection` / `twoFactorSection`, exclusives,
 * `LoginView.swift:118-124`) — l'en sortir romprait le flux au milieu.
 *
 * FIXTURES ⇒ TOUJOURS `allow` : le POC et ses captures n'ont pas de session
 * réelle à faire respecter, et cette garde ne doit pas casser ce qui marche
 * déjà avant que le travail `staging` (#5605, livré) ne soit consommé partout.
 */

export type RouteKey = 'list' | 'thread' | 'progression' | 'login' | 'signup';

export type RouteAccessDecision = 'allow' | 'redirect-login' | 'redirect-home';

const PRIVATE_ROUTES: ReadonlySet<string> = new Set<RouteKey>(['list', 'thread', 'progression']);
const AUTH_ROUTES: ReadonlySet<string> = new Set<RouteKey>(['login', 'signup']);

/**
 * `routeKey` entre en `string`, pas en `RouteKey` (correction de revue,
 * défaut 11) : la clé vient du ROUTEUR (`useRoute().key`), qui rend `''` pour
 * une adresse inconnue et rendra demain la clé de chaque route ajoutée. La
 * resserrer par une assertion (`key as RouteKey`) aurait fait passer un type
 * pour une garantie que rien ne tient. `RouteKey` reste exporté : il nomme les
 * routes que cette loi CONNAÎT — toute autre est publique et neutre.
 */
export function resolveRouteAccess(input: {
  readonly sessionStatus: SessionState['status'];
  readonly source: 'fixtures' | 'gateway';
  readonly routeKey: string;
}): RouteAccessDecision {
  if (input.source === 'fixtures') return 'allow';

  if (PRIVATE_ROUTES.has(input.routeKey)) {
    return input.sessionStatus === 'authenticated' ? 'allow' : 'redirect-login';
  }

  if (AUTH_ROUTES.has(input.routeKey)) {
    return input.sessionStatus === 'authenticated' ? 'redirect-home' : 'allow';
  }

  return 'allow';
}
