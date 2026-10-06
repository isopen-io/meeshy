import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { AtlasStamp, stampTone } from './atlas-stamp';

const CSS = readFileSync(new URL('../../styles/game.css', import.meta.url), 'utf8');
const render = (props: Parameters<typeof AtlasStamp>[0]): string => renderToStaticMarkup(<AtlasStamp {...props} />);

/**
 * LE TAMPON DE L’ATLAS (#9388, conception II.8) — un cachet rond à deux
 * cercles, le code de la langue en grandes lettres, la Signature dessous. Un
 * tampon posé a une couleur ; un tampon à découvrir est en pointillé, sans
 * code. La couleur d’une langue est TOUJOURS la même : on la retrouve d’un
 * passage à l’autre.
 */
describe('AtlasStamp', () => {
  test('un tampon posé : deux cercles pleins, le code en capitales, la Signature', () => {
    const html = render({ code: 'sw', size: 64 });
    expect(html).toContain('data-game-stamp="sw"');
    expect(html).toContain('>SW<');
    expect(html).toContain('data-game-signature="flat"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('stroke-dasharray');
  });

  test('un tampon à découvrir : pointillé, aucun code', () => {
    const html = render({ code: null, size: 64 });
    expect(html).toContain('data-game-stamp="empty"');
    expect(html).toContain('stroke-dasharray');
    expect(html).not.toMatch(/<text/);
  });

  test('un code long ne garde que deux lettres (fr-CA devient FR)', () => {
    expect(render({ code: 'fr-CA', size: 64 })).toContain('>FR<');
  });

  test('la couleur d’une langue ne change pas d’un rendu à l’autre, et vient d’un jeton déclaré', () => {
    expect(stampTone('sw')).toBe(stampTone('sw'));
    for (const code of ['fr', 'es', 'ar', 'sw', 'ja', 'zh', 'hi', 'pt']) {
      expect(stampTone(code)).toMatch(/^var\(--game-stamp-\d\)$/);
    }
    for (let i = 0; i < 6; i += 1) expect(CSS).toMatch(new RegExp(`--game-stamp-${i}\\s*:`));
  });

  test('aucun littéral de couleur écrit par le composant', () => {
    expect(render({ code: 'fr', size: 64 })).not.toMatch(/ (?:fill|stroke)="#/);
  });
});
