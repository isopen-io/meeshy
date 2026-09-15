import type { SessionState } from './api/session';
import { safeReturnPath } from './view/magic-link';

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
  | 'stories'
  | 'storyCompose'
  | 'story'
  | 'feed'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'admin'
  | 'adminUsers'
  | 'login'
  | 'signup'
  | 'welcome'
  | 'magicLink'
  | 'magicLinkValidate'
  | 'forgotPassword'
  /**
   * LA JONCTION PAR LIEN (#5561) — dans AUCUN ensemble, comme
   * `magicLinkValidate`. `/chat/:link` est la seule adresse de conversation
   * qui sert quelqu'un sans compte, et la seule où un compte connecté
   * REJOINT : privée, elle renverrait l'invité vers la connexion avant qu'il
   * sache à quoi il est invité ; d'authentification, elle renverrait le
   * membre vers `/` avant qu'il ait pu rejoindre. L'écran lit la session
   * lui-même pour choisir entre « Rejoindre » et ses deux sorties.
   */
  | 'chatJoin';

export type RouteAccessDecision = 'allow' | 'redirect-login' | 'redirect-home' | 'redirect-welcome';

/**
 * `conversationsNew` (#5652, revue) — CRÉER une conversation est un geste de
 * MEMBRE : la route est arrivée avec son écran mais n'a jamais été déclarée
 * ici, donc un visiteur SANS SESSION y entrait et n'y trouvait qu'une
 * recherche que la passerelle refuse (401 sur `GET /directory/people`). Une
 * route privée non déclarée est la forme la plus discrète du défaut : rien ne
 * rougit, l'écran s'ouvre, et c'est l'API qui dit non — trois écrans plus
 * tard, on aura oublié pourquoi.
 *
 * `stories`/`storyCompose`/`story` (#5817, correctif d'un défaut de la MÊME
 * classe, relevé § 2 de la spécification) — leurs ports (`GET /posts/feed/
 * stories`, `POST /posts/:postId/view`) sont tous `requiredAuth` ; un
 * visiteur sans compte y recevait un écran qui s'ouvre puis un 401 en
 * silence, jamais une invitation à se connecter.
 *
 * `feed` (#5893) — `GET /social/posts?scope=home` EXIGE une session
 * (`services/gateway/src/routes/posts/feed.ts:790-792`, 401 `UNAUTHORIZED`),
 * bien que `optionalAuth` garde la porte : un visiteur sans compte y recevait
 * jusqu'ici l'écran d'attente (route publique par défaut), puis — le jour où
 * ce lot lui donne du contenu — un 401 en silence.
 *
 * `notifications` (#6288) — la même classe, fermée AVANT le contenu cette
 * fois : les routes `/notifications*` de la passerelle portent toutes
 * `onRequest: [fastify.authenticate]`.
 *
 * `profile` (#6289) — `/me` est SON profil : `PATCH /users/me*` et
 * `GET /users/me/stats` portent `fastify.authenticate`. Un visiteur sans compte
 * n'a pas de soi à voir ni à modifier.
 *
 * `settings` (#6340) — `GET`/`PATCH /me/preferences` portent
 * `fastify.authenticate`. Laissée publique par #5563, la route ouvrait sans
 * session un écran dont la requête restait désactivée : squelettes À VIE, et
 * une déconnexion offerte à qui n'est pas connecté.
 *
 * `admin` / `adminUsers` (#6432) — PRIVÉES, et cette garde ne fait que la
 * MOITIÉ du travail. Elle exige une session ; le DROIT, lui, se lit au
 * serveur (`GET /me/permissions`) dans l'écran. La séparation n'est pas un
 * oubli : `SessionUser` ne projette pas `role` (`lib/api/session.ts`), donc
 * une garde de route qui trancherait ici ne pourrait que le DEVINER — et une
 * garde qui devine sur une porte d'administration est pire qu'aucune garde,
 * parce qu'on croit qu'elle garde. Ce qu'elle apporte est réel malgré tout :
 * un visiteur sans compte est renvoyé vers la connexion plutôt que de voir un
 * écran qui charge puis refuse.
 */
const PRIVATE_ROUTES: ReadonlySet<string> = new Set<RouteKey>([
  'list',
  'thread',
  'conversationsNew',
  'progression',
  'stories',
  'storyCompose',
  'story',
  'feed',
  'notifications',
  'profile',
  'settings',
  'admin',
  'adminUsers',
]);
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

/** Les caractères que le parseur d'URL EFFACE — blancs, contrôles C0, DEL.
 * Aucun ne sort de `href()`, qui encode tout. Une fonction plutôt qu'une classe
 * d'expression régulière : la source n'a ainsi aucun caractère de contrôle à
 * écrire, pas même échappé. */
const isWhitespaceOrControl = (character: string): boolean => {
  const code = character.charCodeAt(0);
  return character.trim() === '' || code < 0x20 || code === 0x7f;
};

/**
 * `next` — OÙ REVENIR APRÈS S'ÊTRE CONNECTÉ (#5561), ou `null`.
 *
 * La valeur vient de l'ADRESSE, donc de quiconque a fabriqué le lien. La règle
 * de même origine est celle de `safeReturnPath` (`view/magic-link.ts`, le
 * retour d'un lien magique) — réemployée, jamais recopiée : deux clampages
 * d'une même valeur hostile divergeraient au premier correctif.
 *
 * Elle y ajoute ce que `safeReturnPath` laisse passer et qu'une redirection de
 * SESSION ne peut pas se permettre : le parseur d'URL retire tabulations et
 * retours à la ligne, si bien que `/\t/evil.com` devient `//evil.com`. Ce
 * n'est pas une redirection ouverte — `history.replaceState` refuse une autre
 * origine — mais il LÈVE, et dans l'effet de `SessionGate` (`main.tsx`) c'est
 * l'application entière qui tomberait pour un lien forgé.
 *
 * `null` plutôt que `'/'` : un appelant doit pouvoir savoir qu'il n'y a RIEN à
 * transmettre (le lien « Créer un compte » ne porte pas un `next=/` inventé).
 */
export function safeNextPath(raw: string | null): string | null {
  if (raw === null || raw === '' || [...raw].some(isWhitespaceOrControl)) return null;
  return safeReturnPath(raw) === raw ? raw : null;
}

/**
 * LA DESTINATION D'UNE SESSION QUI VIENT DE S'OUVRIR — `next` s'il est sûr,
 * l'accueil sinon. L'accueil est FOURNI par l'appelant (`href('list')`) : ce
 * module décide, il ne connaît pas le routeur.
 *
 * Elle sert les TROIS sites qui naviguent quand une session s'établit sur un
 * écran d'authentification — `SessionGate` (`redirect-home`), la connexion et
 * l'inscription. Ils partent du même rendu : si l'un seulement honorait
 * `next`, le parent (`SessionGate`, dont l'effet s'exécute APRÈS celui de
 * l'écran) le recouvrirait par `/`.
 */
export function landingAfterSession(next: string | null, home: string): string {
  return safeNextPath(next) ?? home;
}
