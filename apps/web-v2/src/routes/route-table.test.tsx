import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { Suspense } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { compile, match } from '@/lib/router';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { NotFound, ROUTES } from './route-table';

/**
 * LES ADRESSES D'AUTHENTIFICATION (#5555, T8) — `/login` et `/signup`
 * s'apparient, et chaque écran est un `import()` (découpage par route, D-3) :
 * un ÉCRAN de plus dans le socle romprait le budget de première peinture que
 * `check-curve.mjs` garde.
 */

describe('ROUTES — /login et /signup', () => {
  test('login s’apparie à /login, pas à autre chose', () => {
    const compiled = compile(ROUTES.login.pattern);
    expect(match(compiled, '/login')).toEqual({});
    expect(match(compiled, '/signup')).toBe(null);
  });

  test('signup s’apparie à /signup', () => {
    const compiled = compile(ROUTES.signup.pattern);
    expect(match(compiled, '/signup')).toEqual({});
  });

  test('progression s’apparie à /me/progression — sous l’espace du profil, et à rien d’autre (#5547)', () => {
    const compiled = compile(ROUTES.progression.pattern);
    expect(match(compiled, '/me/progression')).toEqual({});
    expect(match(compiled, '/me')).toBe(null);
    expect(match(compiled, '/progression')).toBe(null);
  });

  test('chaque route est un import() paresseux, pas un module déjà résolu', () => {
    // On ne les APPELLE PAS : invoquer `screen()` déclenche l'`import()` réel
    // (donc la transpilation JSX du module cible) au lieu de tester la seule
    // FORME de la table — même discipline que `list`/`thread`, jamais
    // exercés ici non plus.
    expect(typeof ROUTES.login.screen).toBe('function');
    expect(typeof ROUTES.signup.screen).toBe('function');
    expect(typeof ROUTES.progression.screen).toBe('function');
  });
});

/**
 * LES QUATRE ADRESSES DE #5816 (T1) — chacune s'apparie à SON motif et à
 * rien d'autre : en particulier `magicLink` ne prend PAS
 * `/auth/magic-link/validate` (le regex de `compile` est ANCRÉ, `router.tsx:102`
 * — sans l'ancrage, un préfixe apparierait aussi son propre suffixe), et
 * `magicLinkValidate` ne prend pas `/auth/magic-link`.
 */
describe('ROUTES — les quatre adresses de #5816', () => {
  test('welcome s’apparie à /welcome', () => {
    const compiled = compile(ROUTES.welcome.pattern);
    expect(match(compiled, '/welcome')).toEqual({});
  });

  test('magicLink s’apparie à /auth/magic-link, jamais à /auth/magic-link/validate', () => {
    const compiled = compile(ROUTES.magicLink.pattern);
    expect(match(compiled, '/auth/magic-link')).toEqual({});
    expect(match(compiled, '/auth/magic-link/validate')).toBe(null);
  });

  test('magicLinkValidate s’apparie à /auth/magic-link/validate, jamais à /auth/magic-link', () => {
    const compiled = compile(ROUTES.magicLinkValidate.pattern);
    expect(match(compiled, '/auth/magic-link/validate')).toEqual({});
    expect(match(compiled, '/auth/magic-link')).toBe(null);
  });

  test('forgotPassword s’apparie à /forgot-password', () => {
    const compiled = compile(ROUTES.forgotPassword.pattern);
    expect(match(compiled, '/forgot-password')).toEqual({});
  });

  test('les quatre screen sont des fonctions (import() paresseux)', () => {
    expect(typeof ROUTES.welcome.screen).toBe('function');
    expect(typeof ROUTES.magicLink.screen).toBe('function');
    expect(typeof ROUTES.magicLinkValidate.screen).toBe('function');
    expect(typeof ROUTES.forgotPassword.screen).toBe('function');
  });
});

/**
 * LE LECTEUR PLEIN ÉCRAN (#5817) — `/story/$post` nomme un POST, jamais une
 * personne (D-5, nomenclature legacy `/story/:postId`) ; l'id d'entrée est
 * calculé par l'APPELANT (rail, liste) — voir `entryStoryId`,
 * `lib/view/story-tray.ts`.
 */
describe('ROUTES — le lecteur de stories (#5817)', () => {
  /** LE DÉTAIL D'UNE PUBLICATION (#6278, D-49) — `/post/$post` est l'adresse
   * que la passerelle range dans ses liens suivis (`PostService.ts:1742`) et
   * que le legacy sert déjà (`apps/web/app/post/[postId]`) ; `/feeds/post/$post`
   * est celle des liens profonds d'iOS (`DeepLinkRouter.swift:106`) et du
   * partage (`share-url.ts`). Deux portes, UN écran. */
  test('post s’apparie à /post/<id>, et /feeds/post/<id> ouvre le MÊME écran', () => {
    expect(match(compile(ROUTES.post.pattern), '/post/abc123')).toEqual({ post: 'abc123' });
    expect(match(compile(ROUTES.postDeepLink.pattern), '/feeds/post/abc123')).toEqual({ post: 'abc123' });
    expect(match(compile(ROUTES.post.pattern), '/post/')).toBe(null);
    expect(ROUTES.postDeepLink.screen).toBe(ROUTES.post.screen);
  });

  test('story s’apparie à /story/<id> et en extrait le paramètre `post`', () => {
    const compiled = compile(ROUTES.story.pattern);
    expect(match(compiled, '/story/abc123')).toEqual({ post: 'abc123' });
    expect(match(compiled, '/story/')).toBe(null);
    expect(match(compiled, '/stories')).toBe(null);
  });

  test('story est un import() paresseux', () => {
    expect(typeof ROUTES.story.screen).toBe('function');
  });
});

/**
 * L'ÉCRAN D'ADRESSE INCONNUE (#6341) — ses deux textes viennent du catalogue
 * d'interface, plus « Cette href n’existe pas. » en dur. Le témoin s'écrit en
 * ANGLAIS et en ARABE : en français, le texte en dur d'hier et le catalogue
 * rendraient la même chose pour le titre (mais pas pour le mot « href », qui
 * ne survivrait à aucune des deux).
 */
describe('NotFound — ce qu’il dit vient du catalogue (#6341)', () => {
  beforeAll(async () => {
    ensureHappyDomRegistered();
    await Promise.all([loadInterfaceCatalog('en'), loadInterfaceCatalog('ar'), loadInterfaceCatalog('fr')]);
  });

  afterAll(async () => {
    await releaseHappyDomIfRegistered();
  });

  afterEach(() => {
    document.documentElement.lang = 'fr';
  });

  const render = () => renderToStaticMarkup(<NotFound />);

  test('fr : le titre ne porte plus le mot « href »', () => {
    const html = render();
    expect(html).toContain('Cette adresse n&#x27;existe pas.');
    expect(html).toContain('Revenir aux conversations');
    expect(html).not.toContain('Cette href');
  });

  test('en : titre et retour en anglais', () => {
    document.documentElement.lang = 'en';
    const html = render();
    expect(html).toContain('This address doesn&#x27;t exist.');
    expect(html).toContain('Back to conversations');
    expect(html).not.toContain('adresse');
  });

  test('ar : titre et retour en arabe', () => {
    document.documentElement.lang = 'ar';
    const html = render();
    expect(html).toContain('هذا العنوان غير موجود.');
    expect(html).toContain('العودة إلى المحادثات');
  });

  /**
   * SUSPENSE SANS ROUTE (#6341) — une adresse inconnue n'a, par définition,
   * traversé aucun `screenPrerequisite` : `NotFound` doit donc pouvoir se
   * rendre sous une limite Suspense (celle que `router.tsx` pose déjà autour
   * de chaque écran) SANS jamais laisser fuir l'erreur « catalogue lu avant
   * d'être chargé » — que le catalogue de la langue courante soit déjà en
   * cache ou non. Le comportement de `suspendForInterfaceCatalog` lui-même
   * (jette la promesse en cours puis ne jette plus) est prouvé sans dépendre
   * de l'ordre d'exécution des fichiers de témoins dans `i18n-catalog.test.ts`.
   */
  test('sous Suspense, une adresse inconnue ne laisse jamais fuir l’erreur de catalogue non chargé', () => {
    document.documentElement.lang = 'de';
    expect(() =>
      renderToStaticMarkup(
        <Suspense fallback={<p>…</p>}>
          <NotFound />
        </Suspense>,
      ),
    ).not.toThrow();
  });
});

/**
 * L'ADRESSE D'UNE HUMEUR PARTAGÉE (#7313) — `/mood/:postId`.
 *
 * DERNIÈRE des quatre adresses que `PostService.shareWithTrackingLink` compose
 * (`{ POST: 'post', REEL: 'reel', STORY: 'story', STATUS: 'mood' }`) et la
 * dernière à tomber : `/post` et `/story` étaient servies, `/reel` l'est depuis
 * #7298. Comme pour le réel, `/l/:token` y envoie le lecteur par un
 * `location.replace` — une navigation ENTIÈRE — et chaque partage d'humeur
 * fabriquait un lien mort de plus.
 *
 * C'est un ALIAS, pas un écran : le legacy le déclare en toutes lettres
 * (`apps/web/app/mood/[postId]/page.tsx` est un `export { default } from
 * '@/app/feeds/post/[postId]/page'`), et le client de la v2 « ne distingue que
 * REEL du reste » (`lib/api/feed-pages.ts`) — une humeur EST une publication.
 * D'où la TROISIÈME porte sur `publicationScreen`, jamais une jumelle.
 *
 * Le témoin interroge l'ADRESSE, jamais la clé : il tombe dès que plus aucune
 * route ne sert `/mood/<id>`.
 */
describe('ROUTES — l’adresse d’une humeur partagée (#7313)', () => {
  const servedBy = (path: string) =>
    Object.values(ROUTES).filter((route) => match(compile(route.pattern), path) !== null);

  test('/mood/<id> est SERVIE, par une route et une seule', () => {
    const served = servedBy('/mood/507f1f77bcf86cd799439011');
    expect(served).toHaveLength(1);
    expect(match(compile(served[0]!.pattern), '/mood/507f1f77bcf86cd799439011')).toEqual({
      post: '507f1f77bcf86cd799439011',
    });
  });

  test('elle ouvre le MÊME écran que /post et /feeds/post — trois portes, un écran', () => {
    expect(servedBy('/mood/abc123')[0]!.screen).toBe(ROUTES.post.screen);
    expect(ROUTES.postDeepLink.screen).toBe(ROUTES.post.screen);
  });

  test('/mood sans identifiant n’est pas une adresse', () => {
    expect(servedBy('/mood')).toHaveLength(0);
    expect(servedBy('/mood/')).toHaveLength(0);
  });

  /**
   * LES TROIS QUE CE LOT PEUT TENIR. La quatrième — `/reel/<id>` — est servie
   * par #7298 (PR #7314), sur une branche SŒUR partie du même `dev` : un témoin
   * qui les nommerait toutes les quatre serait ROUGE dans celui des deux lots
   * qui arrive en premier, quel qu'il soit. Le témoin qui clôt la famille des
   * quatre `webPath` de `PostService.shareWithTrackingLink` se pose donc une
   * fois les DEUX sur `dev`, pas avant.
   */
  test('/post, /story et /mood servent la même publication, quelle que soit la porte', () => {
    for (const path of ['/post/abc123', '/feeds/post/abc123', '/mood/abc123']) {
      expect(servedBy(path)).toHaveLength(1);
      expect(servedBy(path)[0]!.screen).toBe(ROUTES.post.screen);
    }
    expect(servedBy('/story/abc123')).toHaveLength(1);
  });
});
