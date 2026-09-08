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
