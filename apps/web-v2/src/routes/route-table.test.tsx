import { describe, expect, test } from 'bun:test';

import { compile, match } from '@/lib/router';
import { ROUTES } from './route-table';

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
