import { describe, expect, test } from 'bun:test';

import { landingAfterSession, resolveRouteAccess, safeNextPath, type RouteKey } from './session-guard';

/**
 * LA PORTE (#5555, T7) — pure. Fixtures ⇒ toujours `allow` (les captures et le
 * POC ne changent pas) ; passerelle réelle ⇒ les routes PRIVÉES exigent une
 * session, les routes PUBLIQUES d'authentification en refusent une active.
 */

/** `conversationsNew` (#5652, revue) — créer une conversation est un geste de
 * MEMBRE ; la route est arrivée avec son écran sans être déclarée privée.
 * `stories`/`storyCompose`/`story` (#5817) rejoignent le même correctif : leurs
 * ports sont tous `requiredAuth`. `feed` (#5893) de même — `scope=home` exige
 * une session malgré `optionalAuth` à la porte. */
const PRIVATE_ROUTES: readonly RouteKey[] = [
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
  // #5893 — GET /social/posts?scope=home exige une session malgré
  // optionalAuth à la porte : un visiteur sans compte y recevait jusqu'ici
  // l'écran d'attente (route publique par défaut).
  test('feed', () => expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'feed' })).toBe('redirect-login'));
  // #6288 — les six routes `/notifications*` de la passerelle portent toutes
  // `onRequest: [fastify.authenticate]` : la cloche d'un visiteur sans compte
  // n'existe pas, et un écran qui s'ouvre sur un 401 muet n'invite personne.
  test('notifications', () =>
    expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'notifications' })).toBe('redirect-login'));
  // #6340 — `GET`/`PATCH /me/preferences` portent `fastify.authenticate` : sans
  // session, l'écran des réglages désactivait sa requête et gardait ses
  // squelettes À VIE, avec une déconnexion offerte à qui n'est pas connecté.
  test('settings', () =>
    expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'settings' })).toBe('redirect-login'));
  test('profile', () =>
    expect(resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey: 'profile' })).toBe('redirect-login'));
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
/**
 * **L'INVITÉ D'UN LIEN N'ENTRE QUE DANS SON FIL** (#5561).
 *
 * Il a une session, donc une créance — mais elle n'ouvre qu'UNE conversation :
 * `GET /links/:identifier/messages` rend 403 à la session d'un autre lien, et
 * toutes les autres routes privées exigent un COMPTE. L'y laisser entrer
 * peindrait des écrans qu'un 401 défait en silence, la classe de défaut que
 * `stories`, `feed` et `settings` ont déjà payée.
 */
describe('resolveRouteAccess — l’invité d’un lien (#5561)', () => {
  const invite = (routeKey: RouteKey, welcomeCompleted?: boolean) =>
    resolveRouteAccess({
      sessionStatus: 'guest',
      source: 'gateway',
      routeKey,
      ...(welcomeCompleted === undefined ? {} : { welcomeCompleted }),
    });

  test('thread ⇒ allow : c’est la SEULE route privée qui le concerne', () => {
    expect(invite('thread')).toBe('allow');
  });

  for (const route of PRIVATE_ROUTES.filter((key) => key !== 'thread')) {
    test(`${route} ⇒ redirect-login : cette route exige un COMPTE`, () => {
      expect(invite(route)).toBe('redirect-login');
    });
  }

  /* L'accueil n'est PAS proposé à un invité : il a déjà franchi une porte
     d'entrée, et le renvoyer à « bienvenue » effacerait ce qu'il vient de
     faire. Il va à la connexion, seul chemin vers ce qu'il demande. */
  test('jamais redirect-welcome, même si l’accueil n’a pas été soldé', () => {
    expect(invite('list', false)).toBe('redirect-login');
  });

  test('login et signup ⇒ allow : se donner un compte est exactement ce qu’il peut faire', () => {
    expect(invite('login')).toBe('allow');
    expect(invite('signup')).toBe('allow');
  });

  test('chatJoin ⇒ allow : l’invitation reste lisible, quelle que soit la session', () => {
    expect(invite('chatJoin')).toBe('allow');
  });
});

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

/**
 * L'ESPACE D'ADMINISTRATION (#6432) — cette garde n'en fait que la MOITIÉ.
 *
 * Elle exige une session ; le DROIT se lit au serveur dans l'écran
 * (`GET /me/permissions`). La séparation est délibérée : `SessionUser` ne
 * projette pas `role`, donc une garde de route qui trancherait ici ne pourrait
 * que le deviner — et une garde qui devine sur une porte d'administration est
 * pire qu'aucune garde, parce qu'on la croit posée.
 *
 * Ce que ces témoins mesurent est donc exactement ce que cette loi PROMET, ni
 * plus ni moins : un visiteur sans compte n'entre pas.
 */
describe("les routes d'administration sont PRIVÉES", () => {
  for (const routeKey of ['admin', 'adminUsers'] as const) {
    test(`${routeKey} : une session AUTHENTIFIÉE passe`, () => {
      expect(
        resolveRouteAccess({ sessionStatus: 'authenticated', source: 'gateway', routeKey }),
      ).toBe('allow');
    });

    test(`${routeKey} : sans session, on est renvoyé vers la connexion`, () => {
      expect(
        resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey }),
      ).toBe('redirect-login');
    });

    test(`${routeKey} : sans accueil soldé, l'accueil passe d'abord`, () => {
      expect(
        resolveRouteAccess({ sessionStatus: 'anonymous', source: 'gateway', routeKey, welcomeCompleted: false }),
      ).toBe('redirect-welcome');
    });
  }
});

/**
 * LA JONCTION PAR LIEN (#5561) — `/chat/:link` est la SEULE adresse de
 * conversation qui sert quelqu'un sans compte, et la seule où un compte
 * connecté REJOINT. Elle n'entre donc dans aucun des deux ensembles : privée,
 * elle renverrait l'invité vers la connexion avant qu'il ait vu à quoi il est
 * invité ; d'authentification, elle renverrait le membre vers `/` avant qu'il
 * ait pu rejoindre.
 */
describe('chatJoin — publique pour les TROIS statuts, accueil soldé ou non', () => {
  for (const sessionStatus of ['anonymous', 'pending2fa', 'authenticated'] as const) {
    for (const welcomeCompleted of [true, false]) {
      test(`${sessionStatus}, accueil ${welcomeCompleted ? 'soldé' : 'non soldé'} ⇒ allow`, () => {
        expect(resolveRouteAccess({ sessionStatus, source: 'gateway', routeKey: 'chatJoin', welcomeCompleted })).toBe('allow');
      });
    }
  }
});

/**
 * `next` — OÙ REVENIR APRÈS S'ÊTRE CONNECTÉ (#5561). La valeur vient de
 * l'adresse, donc de quiconque a fabriqué le lien : elle ne sort jamais du
 * domaine, et elle ne peut pas faire tomber l'application.
 */
describe('safeNextPath — un chemin INTERNE, ou rien', () => {
  test('un chemin interne est gardé tel quel, requête comprise', () => {
    expect(safeNextPath('/chat/mshy_equipe_7f3a')).toBe('/chat/mshy_equipe_7f3a');
    // Les linkIds lisibles portent des TIRETS (`mshy_equipe-deploiement_7f3a`) :
    // une classe de caractères mal bornée les refuserait sans bruit.
    expect(safeNextPath('/chat/mshy_equipe-deploiement_7f3a')).toBe('/chat/mshy_equipe-deploiement_7f3a');
    expect(safeNextPath('/chat/mshy_%C3%A9quipe%207f3a')).toBe('/chat/mshy_%C3%A9quipe%207f3a');
    expect(safeNextPath('/c/64f1c2a9e8b7d6c5b4a39281?autour=m1')).toBe('/c/64f1c2a9e8b7d6c5b4a39281?autour=m1');
  });

  test('absent ou vide ⇒ rien', () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath('')).toBeNull();
  });

  test('refuse toute sortie du domaine : `//evil.com`, `https://…`, schémas, contre-obliques', () => {
    for (const hostile of ['//evil.com', '//evil.com/chat/x', 'https://evil.com', 'http://evil.com/c/1', 'javascript:alert(1)', '/\\evil.com', '\\\\evil.com', 'evil.com']) {
      expect({ hostile, next: safeNextPath(hostile) }).toEqual({ hostile, next: null });
    }
  });

  /** Le parseur d'URL RETIRE tabulations et retours à la ligne : `/\t/evil.com`
   * devient `//evil.com`, et `history.replaceState` LÈVE sur une adresse d'une
   * autre origine — dans l'effet de `SessionGate`, c'est l'application entière
   * qui tombe pour un lien forgé. */
  test('refuse les caractères de contrôle que le parseur d’URL efface', () => {
    for (const hostile of ['/\t/evil.com', '/\n/evil.com', '/\r/evil.com', '/chat/x ', `/chat/x${String.fromCharCode(0)}`, `/chat/x${String.fromCharCode(127)}`]) {
      expect({ hostile: JSON.stringify(hostile), next: safeNextPath(hostile) }).toEqual({ hostile: JSON.stringify(hostile), next: null });
    }
  });
});

describe('landingAfterSession — `next` s’il est sûr, l’accueil sinon', () => {
  test('un `next` interne gagne', () => {
    expect(landingAfterSession('/chat/mshy_abc', '/')).toBe('/chat/mshy_abc');
  });

  test('un `next` absent ou hostile rend l’accueil fourni par l’appelant', () => {
    expect(landingAfterSession(null, '/')).toBe('/');
    expect(landingAfterSession('//evil.com', '/')).toBe('/');
    expect(landingAfterSession('https://evil.com', '/accueil')).toBe('/accueil');
  });
});
