import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

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
