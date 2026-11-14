import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

import { meeshyGlassButtonRecipe } from '@/components/kit/meeshy-glass-button-recipe';

/**
 * LA RÈGLE 32 COUPE LE MOUVEMENT SANS EN CRÉER (#12893). Tout élément porte
 * `transition-property: all` par défaut : une durée non nulle posée sur `*`
 * fait de CHAQUE changement de style une transition, et toute lecture de
 * géométrie de la même tâche voit encore la valeur de départ. La liste
 * virtualisée (#11228) y lisait la hauteur d'une cale à zéro, et sa passe de
 * mesure alternait entre deux fenêtres sans jamais rendre la main.
 */

const CSS = readFileSync(new URL('./app.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const reducedBlock = (): string => {
  const start = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
  const open = CSS.indexOf('{', CSS.indexOf('*::after', start));
  return CSS.slice(open, CSS.indexOf('}', open));
};

const declaration = (block: string, property: string): string | undefined =>
  new RegExp(`(?:^|[;{\\s])${property}\\s*:\\s*([^;]+);`).exec(block)?.[1]?.trim();

describe('app.css — prefers-reduced-motion', () => {
  test('les transitions tombent à une durée NULLE : aucune ne naît d’un changement de style', () => {
    expect(declaration(reducedBlock(), 'transition-duration')).toBe('0s !important');
  });

  test('les animations gardent une durée infime, pour que leur fin (animationend) arrive encore', () => {
    expect(declaration(reducedBlock(), 'animation-duration')).toBe('0.01ms !important');
  });
});

const sheet = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');

const lastReducedBlock = (css: string): string => {
  const start = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(start);
};

const ruleFor = (css: string, selector: string): string => {
  const at = css.indexOf(selector);
  expect(at).toBeGreaterThanOrEqual(0);
  return css.slice(at, css.indexOf('}', at));
};

const ONBOARDING_PRESSED = ['.onb-primary', '.onb-secondary', '.onb-skip', '.onb-link'].map((name) => `${name}:active:not(:disabled)`);
const PROFILE_PRESSED = ['.onb-profile-banner', '.onb-profile-avatar'].map((name) => `${name}:active:not(:disabled)`);

describe('un fondu sans durée prend celle de la fiche (#18412)', () => {
  test('la durée par défaut des transitions est le fondu de K02, sur la courbe du verre', () => {
    const fade = meeshyGlassButtonRecipe({ kind: 'active', size: 44 }).fadeMs;
    expect(declaration(CSS, '--default-transition-duration')).toBe(`${fade}ms`);
    expect(declaration(CSS, '--default-transition-timing-function')).toBe('ease');
  });

  test('l’appui long lit le retour nommé au lieu de son littéral', () => {
    const css = sheet('press-feedback.css');
    expect(css).not.toContain('180ms');
    expect(css).toContain('var(--press-return-ms)');
    expect(css).toContain('var(--press-curve)');
  });
});

describe('les boutons de l’accueil répondent à l’appui, sans échelle sous réduction (#18412)', () => {
  test('les quatre boutons de l’accueil s’enfoncent à l’appui', () => {
    const css = sheet('onboarding.css');
    const motion = css.slice(0, css.indexOf('@media (prefers-reduced-motion: reduce)'));
    for (const selector of ONBOARDING_PRESSED) expect(ruleFor(motion, selector)).toContain('transform: scale(0.96)');
  });

  test('sous réduction, aucun ne garde d’échelle : le voile de K02 reste', () => {
    const reduced = lastReducedBlock(sheet('onboarding.css'));
    for (const selector of ONBOARDING_PRESSED) {
      const rule = ruleFor(reduced, selector);
      expect(rule).toContain('transform: none');
      expect(rule).toContain('opacity: var(--press-reduced-opacity)');
    }
  });

  test('la bannière et l’avatar du profil répondent aussi, et sans échelle sous réduction', () => {
    const css = sheet('onboarding-profile.css');
    const reducedAt = css.lastIndexOf('@media (prefers-reduced-motion: reduce)');
    for (const selector of PROFILE_PRESSED) {
      expect(ruleFor(css, selector)).toContain('transform: scale(0.96)');
      const rule = ruleFor(css.slice(reducedAt), selector);
      expect(rule).toContain('transform: none');
      expect(rule).toContain('opacity: var(--press-reduced-opacity)');
    }
  });
});
