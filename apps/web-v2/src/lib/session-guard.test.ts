import { describe, expect, test } from 'bun:test';

import { resolveRouteAccess, type RouteKey } from './session-guard';

/**
 * LA PORTE (#5555, T7) — pure. Fixtures ⇒ toujours `allow` (les captures et le
 * POC ne changent pas) ; passerelle réelle ⇒ les routes PRIVÉES exigent une
 * session, les routes PUBLIQUES d'authentification en refusent une active.
 */

/** `conversationsNew` (#5652, revue) — créer une conversation est un geste de
 * MEMBRE ; la route est arrivée avec son écran sans être déclarée privée.
 * `stories`/`storyCompose`/`story` (#5817) rejoignent le même correctif : leurs
 * ports sont tous `requiredAuth`. */
const PRIVATE_ROUTES: readonly RouteKey[] = [
  'list',
  'thread',
  'conversationsNew',
  'progression',
  'stories',
  'storyCompose',
  'story',
];
const PUBLIC_AUTH_ROUTES: readonly RouteKey[] = ['login', 'signup'];

describe('resolveRouteAccess — source fixtures : toujours allow (les deux moitiés du seuil)', () => {
  test('toute route, tout statut ⇒ allow', () => {
    for (const routeKey of [...PRIVATE_ROUTES, ...PUBLIC_AUTH_ROUTES]) {
      for (const sessionStatus of ['anonymous', 'pending2fa', 'authenticated'] as const) {
        expect(resolveRouteAccess({ sessionStatus, source: 'fixtures', routeKey })).toBe('allow');
      }
    }
  });
});

describe('resolveRouteAccess — source gateway, visiteur anonyme sur une route PRIVÉE ⇒ redirect-login', () => {
  test('list', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'list' })).toBe('redirect-login'));
  test('thread', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'thread' })).toBe('redirect-login'));
  // #5547 — le tableau de bord lit `GET /me/engagement`, qui ne sert que
  // l'utilisateur AUTHENTIFIÉ : un visiteur sans compte n'y a rien à voir.
  test('progression', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'progression' })).toBe('redirect-login'));
  // #5817 — GET /posts/feed/stories et POST /posts/:postId/view sont
  // requiredAuth : un visiteur sans compte n'y a rien à voir.
  test('stories', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'stories' })).toBe('redirect-login'));
  test('storyCompose', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'storyCompose' })).toBe('redirect-login'));
  test('story', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'story' })).toBe('redirect-login'));
});

describe('resolveRouteAccess — source gateway, session ACTIVE sur login/signup ⇒ redirect-home', () => {
  test('login', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'login' })).toBe('redirect-home'));
  test('signup', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'signup' })).toBe('redirect-home'));
});

describe('resolveRouteAccess — source gateway, visiteur anonyme sur login/signup ⇒ allow', () => {
  test('login', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'login' })).toBe('allow'));
  test('signup', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'signup' })).toBe('allow'));
});

describe('resolveRouteAccess — pending2fa sur login : l’écran 2FA y vit', () => {
  test('login ⇒ allow', () => {
    expect(resolveRouteAccess({ sessionStatus: 'pending2fa', source: 'gateway', routeKey: 'login' })).toBe('allow');
  });
});

describe('resolveRouteAccess — source gateway, session ACTIVE sur une route PRIVÉE ⇒ allow', () => {
  test('list', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'list' })).toBe('allow'));
  test('thread', () => expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey: 'thread' })).toBe('allow'));
});

/**
 * L'ACCUEIL (#5816, T6) — quatre clés neuves. `welcomeCompleted` ne pèse que
 * sur une route PRIVÉE visitée sans session : soldé ⇒ `redirect-login`
 * (comportement inchangé, celui que les blocs ci-dessus vérifient SANS
 * fournir le champ) ; non soldé ⇒ `redirect-welcome`.
 */
describe('resolveRouteAccess — l’accueil (#5816)', () => {
  test('privée + anonyme + welcomeCompleted:false ⇒ redirect-welcome', () => {
    for (const routeKey of PRIVATE_ROUTES) {
      expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey, welcomeCompleted: false })).toBe(
        'redirect-welcome',
      );
    }
  });

  test('privée + anonyme + welcomeCompleted:true ⇒ redirect-login (les deux moitiés du seuil)', () => {
    for (const routeKey of PRIVATE_ROUTES) {
      expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey, welcomeCompleted: true })).toBe(
        'redirect-login',
      );
    }
  });

  test('gateway + authenticated sur welcome/magicLink/forgotPassword ⇒ redirect-home', () => {
    for (const routeKey of ['welcome', 'magicLink', 'forgotPassword'] as const) {
      expect(resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey })).toBe('redirect-home');
    }
  });

  test('gateway + anonyme sur welcome/magicLink/forgotPassword ⇒ allow', () => {
    for (const routeKey of ['welcome', 'magicLink', 'forgotPassword'] as const) {
      expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey })).toBe('allow');
    }
  });

  test('magicLinkValidate ⇒ allow pour les TROIS statuts (§9 Q4 — le jeton ne doit pas expirer dans la boîte mail)', () => {
    for (const sessionStatus of ['anonymous', 'pending2fa', 'authenticated'] as const) {
      expect(resolveRouteAccess({ sessionStatus, source: 'gateway', routeKey: 'magicLinkValidate' })).toBe('allow');
    }
  });

  test('pending2fa sur welcome ⇒ allow (un pending n’est pas une session active)', () => {
    expect(resolveRouteAccess({ sessionStatus: 'pending2fa', source: 'gateway', routeKey: 'welcome' })).toBe('allow');
  });

  test('fixtures ⇒ allow sur les quatre clés neuves, quel que soit welcomeCompleted', () => {
    for (const routeKey of ['welcome', 'magicLink', 'magicLinkValidate', 'forgotPassword'] as const) {
      expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'fixtures', routeKey, welcomeCompleted: false })).toBe('allow');
    }
  });
});
