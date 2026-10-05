import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { BLASON_RANKS } from '@/lib/game/ranks';

import { RankBlason } from './rank-blason';

const render = (props: Parameters<typeof RankBlason>[0]): string => renderToStaticMarkup(<RankBlason {...props} />);
const birds = (html: string): readonly string[] => [...html.matchAll(/data-game-bird="([^"]+)"/g)].map((m) => m[1] ?? '');
const chevrons = (html: string): number => html.match(/data-game-chevron/g)?.length ?? 0;

describe('RankBlason — un écu par rang', () => {
  test('les onze rangs se dessinent, chacun avec son écu et sa Signature gravée', () => {
    for (const rank of BLASON_RANKS) {
      const html = render({ rank, division: 3, size: 150 });
      expect(html).toContain('data-game-shield');
      expect(html).toContain('data-game-signature="engraved"');
    }
  });

  test('un SVG de 200 × 184, décoratif ; la hauteur suit la largeur', () => {
    const html = render({ rank: 'voix', division: 2, size: 100 });
    expect(html).toContain('viewBox="0 0 200 184"');
    expect(html).toContain('width="100"');
    expect(html).toContain('height="92"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-rank="voix"');
  });

  test('Murmure : un écu nu, sans tenants, sans ruban', () => {
    const html = render({ rank: 'murmure', division: 3, size: 100 });
    expect(birds(html)).toEqual([]);
    expect(html).not.toContain('data-game-ribbon');
  });

  test('Passeur porte deux étoiles, Polyglotte trois points', () => {
    expect(render({ rank: 'passeur', division: 3, size: 100 })).toContain('data-game-piece="stars"');
    expect(render({ rank: 'polyglotte', division: 3, size: 100 })).toContain('data-game-piece="dots"');
  });

  test('Ambassadeur : Mee et Meo tiennent l’écu, le ruban porte le nom du rang en capitales', () => {
    const html = render({ rank: 'ambassadeur', division: 1, size: 150, label: 'Ambassadeur' });
    expect(birds(html)).toEqual(['meeJoy', 'meoOpen']);
    expect(html).toContain('data-game-ribbon');
    expect(html).toContain('>AMBASSADEUR<');
  });

  test('un ruban sans libellé reste un ruban, sans texte inventé', () => {
    const html = render({ rank: 'ambassadeur', division: 3, size: 150 });
    expect(html).toContain('data-game-ribbon');
    expect(html).not.toContain('<text');
  });

  test('le tenant de droite est retourné : il regarde l’écu', () => {
    expect(render({ rank: 'orateur', division: 3, size: 150 })).toMatch(/data-game-bird="meoOpen" transform="translate\(200 62\) scale\(-0\.42 0\.42\)"/);
  });

  test('Légende : couronnés ; Mythe : auréolés', () => {
    expect(birds(render({ rank: 'legende', division: 2, size: 150, label: 'Légende' }))).toEqual(['meeCrown', 'meoCrown']);
    expect(birds(render({ rank: 'mythe', division: null, size: 150, label: 'Mythe' }))).toEqual(['meeHalo', 'meoHalo']);
  });

  test('les divisions s’affichent en chevrons : III = 3, II = 2, I = 1 — et le Mythe n’en a pas', () => {
    expect(chevrons(render({ rank: 'voix', division: 3, size: 100 }))).toBe(3);
    expect(chevrons(render({ rank: 'voix', division: 2, size: 100 }))).toBe(2);
    expect(chevrons(render({ rank: 'legende', division: 1, size: 100 }))).toBe(1);
    expect(chevrons(render({ rank: 'mythe', division: null, size: 100 }))).toBe(0);
    expect(chevrons(render({ rank: 'voix', size: 100 }))).toBe(0);
  });

  test('Mythe et Oracle ont leur matière : prisme et platine', () => {
    expect(render({ rank: 'mythe', division: null, size: 100 })).toContain('-p-prism)');
    expect(render({ rank: 'oracle', division: 3, size: 100 })).toContain('-p-platinum)');
  });

  test('aucun littéral de couleur écrit par le composant', () => {
    const html = render({ rank: 'orateur', division: 2, size: 100, label: 'Orateur' });
    expect(html.replace(/<g filter[\s\S]*?<\/g><\/g>/g, '')).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });

  test('deux blasons sur une page ne partagent aucun identifiant', () => {
    const ids = (h: string): readonly string[] => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? '');
    const both = ids(
      renderToStaticMarkup(
        <>
          <RankBlason rank="legende" division={3} size={80} />
          <RankBlason rank="legende" division={3} size={80} />
        </>,
      ),
    );
    expect(both.length).toBeGreaterThan(10);
    expect(new Set(both).size).toBe(both.length);
  });
});
