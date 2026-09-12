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
 *
 * L'ACCUEIL (#5816) — `welcome`/`magicLink`/`forgotPassword` rejoignent
 * `AUTH_ROUTES` : un visiteur déjà authentifié n'y a rien à faire
 * (`redirect-home`, `WelcomeView.swift:37-39`). `magicLinkValidate` n'entre
 * dans AUCUN ensemble — un lien reçu par e-mail doit se VALIDER quel que soit
 * le statut courant (§ 9 Q4 de la spécification : sinon la garde renverrait
 * sur `/` avant que le jeton ne soit consommé, et il expirerait dans la boîte
 * mail — `validateMagicLink()` gère elle-même le cas « déjà connecté »,
 * `MeeshyApp.swift:1019-1034`). Une route PRIVÉE visitée sans session se
 * décide désormais en DEUX temps : l'accueil d'abord (`welcomeCompleted`),
 * la connexion ensuite — miroir `MeeshyApp.swift:37-39`
 * (`shouldShowOnboarding = !hasCompletedOnboarding && !isAuthenticated`).
 */

export type RouteKey =
  | 'list'
  | 'thread'
  | 'conversationsNew'
  | 'progression'
  | 'login'
  | 'signup'
  | 'welcome'
  | 'magicLink'
  | 'magicLinkValidate'
  | 'forgotPassword';

export type RouteAccessDecision = 'allow' | 'redirect-login' | 'redirect-home' | 'redirect-welcome';

/**
 * `conversationsNew` (#5652, revue) — CRÉER une conversation est un geste de
 * MEMBRE : la route est arrivée avec son écran mais n'a jamais été déclarée
 * ici, donc un visiteur SANS SESSION y entrait et n'y trouvait qu'une
 * recherche que la passerelle refuse (401 sur `GET /directory/people`). Une
 * route privée non déclarée est la forme la plus discrète du défaut : rien ne
 * rougit, l'écran s'ouvre, et c'est l'API qui dit non — trois écrans plus
 * tard, on aura oublié pourquoi.
 */
const PRIVATE_ROUTES: ReadonlySet<string> = new Set<RouteKey>(['list', 'thread', 'conversationsNew', 'progression']);
const AUTH_ROUTES: ReadonlySet<string> = new Set<RouteKey>(['login', 'signup', 'welcome', 'magicLink', 'forgotPassword']);

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
  /** Défaut `true` (soldé) : un appelant qui ne connaît pas encore l'accueil
   * (tout le code écrit avant #5816) retrouve exactement le comportement
   * d'hier — `redirect-login`, jamais `redirect-welcome` par surprise. */
  readonly welcomeCompleted?: boolean;
}): RouteAccessDecision {
  if (input.source === 'fixtures') return 'allow';

  if (PRIVATE_ROUTES.has(input.routeKey)) {
    if (input.sessionStatus === 'authenticated') return 'allow';
    return (input.welcomeCompleted ?? true) ? 'redirect-login' : 'redirect-welcome';
  }

  if (AUTH_ROUTES.has(input.routeKey)) {
    return input.sessionStatus === 'authenticated' ? 'redirect-home' : 'allow';
  }

  return 'allow';
}
