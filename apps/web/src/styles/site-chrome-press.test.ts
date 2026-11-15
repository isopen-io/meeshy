import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

/**
 * L'APPUI DES BOUTONS DE meeshy.me (#18322, N6) — `.ld-btn` (« Mes
 * conversations », « Télécharger », « Créer un compte ») s'enfonce dans
 * l'image même, sur l'échelle et la courbe de `btn-press` (ui.css), et ne
 * garde sous « Réduire les animations » que le voile, sans échelle.
 */
const CSS = readFileSync(new URL('./site-chrome.css', import.meta.url).pathname, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const blockOf = (selector: string, from = 0): string => {
  const start = CSS.indexOf(`${selector} {`, from);
  expect(start).toBeGreaterThanOrEqual(0);
  return CSS.slice(start, CSS.indexOf('}', start));
};

describe('site-chrome.css — les boutons de la landing répondent à l’appui', () => {
  test('un .ld-btn appuyé s’enfonce, sans transition à l’appui', () => {
    const pressed = blockOf('.ld-btn:active');
    expect(pressed).toContain('scale: var(--press-scale');
    expect(pressed).toContain('transition: none');
  });

  test('il revient sur la courbe nommée de l’appui', () => {
    expect(blockOf('.ld-btn')).toContain('transition: scale var(--press-return-ms');
  });

  test('sous « Réduire les animations », plus d’échelle : le voile seul', () => {
    const media = CSS.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(media).toBeGreaterThanOrEqual(0);
    const reduced = blockOf('.ld-btn:active', media);
    expect(reduced).toContain('scale: none');
    expect(reduced).toContain('opacity');
  });
});
