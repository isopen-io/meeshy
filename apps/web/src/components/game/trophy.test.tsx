import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Trophy } from './trophy';

const render = (props: Parameters<typeof Trophy>[0]): string => renderToStaticMarkup(<Trophy {...props} />);

/**
 * LES TROPHÉES (#9380, conception IV.4) — coupe de ligue, de saison, de
 * Prestige (Mee et Meo à la base, couronnés) et de Flamme. La Signature y est
 * FRAPPÉE ; l’étiquette de la plaque est donnée, localisée, par l’hôte.
 */
describe('Trophy — la coupe', () => {
  test('une coupe de 120 × 124, décorative', () => {
    const html = render({ kind: 'league', size: 110, label: 'JADE · S41' });
    expect(html).toContain('viewBox="0 0 120 124"');
    expect(html).toContain('width="110"');
    expect(html).toContain('height="114"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-trophy="league"');
  });

  test('la Signature est frappée sur la coupe, à l’encre de la matière', () => {
    const html = render({ kind: 'league', size: 100 });
    expect(html).toContain('data-game-signature="struck"');
    expect(html).toContain('stroke="var(--game-gold-ink)"');
  });

  test('la plaque porte l’étiquette donnée — rien sans étiquette', () => {
    expect(render({ kind: 'season', size: 100, label: 'SAISON 1' })).toContain('>SAISON 1<');
    expect(render({ kind: 'season', size: 100 })).not.toContain('<text');
  });

  test('chaque coupe a sa matière : or (ligue), platine (saison), prisme (Prestige), feu (Flamme)', () => {
    expect(render({ kind: 'league', size: 100 })).toContain('-p-gold)');
    expect(render({ kind: 'season', size: 100 })).toContain('-p-platinum)');
    expect(render({ kind: 'prestige', size: 100 })).toContain('-p-prism)');
    expect(render({ kind: 'flame', size: 100 })).toContain('-p-flame)');
  });

  test('la coupe de ligue peut être d’argent ou de bronze', () => {
    expect(render({ kind: 'league', size: 100, material: 'silver' })).toContain('-p-silver)');
    expect(render({ kind: 'league', size: 100, material: 'bronze' })).toContain('-p-bronze)');
  });

  test('seule la coupe de Prestige porte Mee et Meo, couronnés', () => {
    const birds = (html: string): readonly string[] => [...html.matchAll(/data-game-bird="([^"]+)"/g)].map((m) => m[1] ?? '');
    expect(birds(render({ kind: 'prestige', size: 160 }))).toEqual(['meeCrown', 'meoCrown']);
    for (const kind of ['league', 'season', 'flame'] as const) expect(birds(render({ kind, size: 100 }))).toEqual([]);
  });

  test('le trophée de Prestige est plus large : 170 × 124', () => {
    const html = render({ kind: 'prestige', size: 160 });
    expect(html).toContain('viewBox="0 0 170 124"');
    expect(html).toContain('height="117"');
  });

  test('aucun littéral de couleur écrit par le composant', () => {
    expect(render({ kind: 'league', size: 100, label: 'X' })).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});
