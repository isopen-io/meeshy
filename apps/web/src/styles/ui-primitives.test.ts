import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

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
