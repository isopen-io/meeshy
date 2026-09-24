import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * LE CODE COULEUR DES ÉTATS DU FIL (#7599) — UN code pour les deux
 * plateformes, déclaré dans `MeeshyColors.state*` et DÉRIVÉ vers
 * `packages/design-tokens/ios.css` (#7603). Le web LIT ces variables, il ne
 * recopie aucune valeur : violet d'accent pour une vue unique à ouvrir, gris
 * atténué une fois ouverte, orange pour l'éphémère — jamais le rouge de
 * l'échec d'envoi.
 */
const css = readFileSync(new URL('./thread-protection.css', import.meta.url).pathname, 'utf8');

const ruleOf = (selector: string): string => {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('chaque état se lit par SA couleur (#7599)', () => {
  test('éphémère : orange, jamais le rouge de l’échec', () => {
    const rule = ruleOf('.protected-ephemeral-badge');
    expect(rule).toContain('var(--ios-state-ephemeral)');
    expect(rule).not.toContain('--color-error');
  });

  test('vue unique à ouvrir : violet d’accent', () => {
    expect(ruleOf('.view-once-chip')).toContain('var(--ios-state-view-once)');
  });

  test('vue unique ouverte : gris atténué, fond moins prononcé', () => {
    const rule = ruleOf('.view-once-chip--opened');
    expect(rule).toContain('var(--ios-state-opened)');
  });
});
