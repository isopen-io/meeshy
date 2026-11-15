import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { meeshyGlassButtonRecipe } from '@/components/kit/meeshy-glass-button-recipe';
import { BUTTON } from '@/components/ui-chrome';

/**
 * LES BOUTONS CANONIQUES (#8879) — cinq `@utility` de `ui.css`, une par rôle.
 * Tailwind n'émet un `@utility` que s'il est EMPLOYÉ : la feuille de première
 * peinture ne paie que ce qu'un écran pose. Ce témoin garde trois choses :
 * chaque rôle de `BUTTON` a sa règle, aucune règle n'écrit de couleur en dur,
 * et la feuille est bien importée par l'application.
 */
const UI = readFileSync(new URL('./ui.css', import.meta.url).pathname, 'utf8');
const APP = readFileSync(new URL('./app.css', import.meta.url).pathname, 'utf8');

const ruleOf = (name: string): string => {
  const start = UI.indexOf(`@utility ${name} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return UI.slice(start, UI.indexOf('\n}', start));
};

describe('styles/ui.css — un @utility par rôle de bouton', () => {
  test('chaque rôle de BUTTON est déclaré, avec la cible tactile de 44', () => {
    for (const name of Object.values(BUTTON)) expect(ruleOf(name)).toContain('min-height: 44px');
  });

  test("aucune couleur écrite en dur : chaque teinte vient d'un jeton", () => {
    const code = UI.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/);
  });

  test('le bouton destructif est un TEXTE rouge, jamais du blanc sur du rouge (ConfirmDialog)', () => {
    const rule = ruleOf('btn-destructive');
    expect(rule).toContain('color: var(--color-danger)');
    expect(rule).not.toContain('on-brand');
  });

  test("le bouton sur média suit l'échelle du chrome posé sur un média", () => {
    const rule = ruleOf('btn-on-media');
    expect(rule).toContain('var(--ios-on-media)');
    expect(rule).toContain('var(--ios-scrim-soft)');
  });

  test("app.css importe la feuille des primitives", () => {
    expect(APP).toContain("@import './ui.css';");
  });
});

const PRESSED = ":active:not(:disabled):not([aria-disabled='true'])";
const REDUCED = '@media (prefers-reduced-motion: reduce)';

const rootValue = (name: string): string | undefined =>
  new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(UI.slice(UI.indexOf(':root')))?.[1]?.trim();

const reducedPartOf = (rule: string): string => {
  const start = rule.indexOf(REDUCED);
  expect(start).toBeGreaterThanOrEqual(0);
  return rule.slice(start);
};

const declaredProperties = (block: string): readonly string[] =>
  block.split('\n').flatMap((line) => /^\s*([a-z-]+)\s*:\s*[^;]+;\s*$/.exec(line)?.[1] ?? []);

describe('styles/ui.css — chaque bouton plein répond à l’appui (#18412)', () => {
  test('btn-press enfonce à l’appui, et jamais un bouton désactivé', () => {
    const rule = ruleOf('btn-press');
    expect(rule).toContain(`&${PRESSED}`);
    expect(rule).toContain('scale: var(--press-scale)');
    expect(rule).toContain('transition: scale var(--press-return-ms) var(--press-curve)');
    expect(rule).not.toMatch(/\btransform\s*:/);
  });

  test('chaque rôle de BUTTON reprend la recette d’appui, sans la recopier', () => {
    for (const name of Object.values(BUTTON)) expect(ruleOf(name)).toContain('@apply btn-press;');
  });

  test('sous « Réduire les animations », plus d’échelle : le voile de K02 reste', () => {
    const reduced = reducedPartOf(ruleOf('btn-press'));
    expect(reduced).toContain(`&${PRESSED}`);
    expect(reduced).toContain('scale: none');
    expect(reduced).toContain('opacity: var(--press-reduced-opacity)');
    for (const property of declaredProperties(reduced)) expect(['scale', 'opacity', 'color', 'background-color']).toContain(property);
  });

  test('les jetons de l’appui sont nommés, et le voile réduit EST celui de K02', () => {
    expect(rootValue('--press-scale')).toBe('0.95');
    expect(rootValue('--press-return-ms')).toBe('180ms');
    expect(rootValue('--press-curve')).toBe('cubic-bezier(0.2, 0, 0, 1)');
    const pressed = meeshyGlassButtonRecipe({ kind: 'active', size: 44, isPressed: true }).fillOpacity;
    expect(Number(rootValue('--press-reduced-opacity'))).toBe(pressed);
  });
});
