import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * LE FLOU SE FOND DANS LE FIL (#18021) — miroir de `BlurRevealModifier`
 * (`BubbleBlurRevealLifecycle.swift`) : iOS floute le contenu puis le masque
 * par un rectangle arrondi LUI-MÊME flouté, si bien qu'aucun bord ne se lit.
 * Le web rognait le substitut flouté par `overflow: hidden` : le message
 * dessinait un rectangle gris aux bords francs.
 */
const css = readFileSync(new URL('./thread-protection.css', import.meta.url).pathname, 'utf8');

const ruleOf = (selector: string): string => {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start, css.indexOf('}', start));
};

describe('le voile d’un message flouté n’a pas de bord (#18021)', () => {
  test('le substitut flouté n’est plus rogné net', () => {
    expect(ruleOf('.protected-veil')).not.toMatch(/overflow:\s*hidden/);
  });

  test('ses bords s’estompent par un masque en dégradé, dans les deux axes', () => {
    const rule = ruleOf('.protected-veil');
    expect(rule).toMatch(/(^|[^-])mask-image:\s*linear-gradient\(to right,\s*transparent/);
    expect(rule).toMatch(/linear-gradient\(to bottom,\s*transparent/);
    expect(rule).toMatch(/(^|[^-])mask-composite:\s*intersect/);
    expect(rule).toMatch(/-webkit-mask-composite:\s*source-in/);
  });

  test('la marge du fondu ne déplace rien : marge négative = rembourrage, cible tactile tenue', () => {
    const rule = ruleOf('.protected-veil');
    expect(rule).toContain('margin: calc(-1 * var(--veil-feather-y)) calc(-1 * var(--veil-feather-x));');
    expect(rule).toContain('padding: var(--veil-feather-y) var(--veil-feather-x);');
    expect(rule).toContain('min-height: calc(44px + 2 * var(--veil-feather-y));');
  });

  test('le focus clavier rend son anneau visible', () => {
    expect(ruleOf('.protected-veil:focus-visible')).toMatch(/mask-image:\s*none/);
  });
});
