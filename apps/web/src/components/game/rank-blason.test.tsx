import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { mythicRayCount } from '@meeshy/shared/utils/game/mythic-signature';
import { MYTHIC_HALO_DEFAULT_RAYS, RANK_CRESTS } from '@meeshy/shared/utils/game/rank-crest';

import { BLASON_RANKS } from '@/lib/game/ranks';

import { RankBlason } from './rank-blason';

const render = (props: Parameters<typeof RankBlason>[0]): string => renderToStaticMarkup(<RankBlason {...props} />);
const birds = (html: string): readonly string[] => [...html.matchAll(/data-game-bird="([^"]+)"/g)].map((m) => m[1] ?? '');
const count = (pattern: RegExp, html: string): number => html.match(pattern)?.length ?? 0;
const notches = (html: string) => ({ on: count(/data-game-notch="on"/g, html), off: count(/data-game-notch="off"/g, html) });
const crestOf = (html: string): string => /<g data-game-crest="[^"]*"[^>]*>([\s\S]*?)<\/g>/.exec(html)?.[1] ?? '';

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

  test('les cibles du geste ne portent PAS de transform propre : l’animer ne défait pas leur position', () => {
    const html = render({ rank: 'ambassadeur', division: 1, size: 150, label: 'Ambassadeur' });
    expect(html).toMatch(/<g transform="translate\(50 26\)"><g data-game-shield="">/);
    expect(html.match(/<g data-game-pose="">/g)).toHaveLength(2);
    expect(html).not.toMatch(/data-game-pose="" transform/);
    expect(html).not.toMatch(/data-game-crest="[^"]*" transform/);
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

  test('Mythe et Oracle ont leur matière : prisme et platine', () => {
    expect(render({ rank: 'mythe', division: null, size: 100 })).toContain('-p-prism)');
    expect(render({ rank: 'oracle', division: 3, size: 100 })).toContain('-p-platinum)');
  });

  test('aucun littéral de couleur écrit par le composant', () => {
    const html = render({ rank: 'orateur', division: 2, size: 100, label: 'Orateur', level: 40 });
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

describe('la décoration de chaque rang, à la Signature (#9636)', () => {
  test('chaque rang dessine les pièces de SA table, et deux rangs ne se dessinent jamais pareil', () => {
    const crests = BLASON_RANKS.filter((rank) => rank !== 'mythe').map((rank) => {
      const html = render({ rank, division: 3, size: 150 });
      expect(html).toContain(`data-game-crest="${rank}"`);
      expect(count(/data-game-crest-piece=/g, html)).toBe(RANK_CRESTS[rank].length);
      return crestOf(html);
    });
    expect(new Set(crests).size).toBe(crests.length);
  });

  test('les traits ont des bouts ronds, comme la Signature', () => {
    const crest = crestOf(render({ rank: 'voix', division: 3, size: 150 }));
    expect(count(/stroke-linecap="round"/g, crest)).toBe(3);
  });

  test('la décoration se pose DERRIÈRE l’écu', () => {
    const html = render({ rank: 'passeur', division: 3, size: 150 });
    expect(html.indexOf('data-game-crest')).toBeLessThan(html.indexOf('data-game-shield'));
  });
});

describe('la division en encoches : V = 1 … I = 5 (#9636)', () => {
  test('cinq emplacements, les pleins à gauche', () => {
    expect(notches(render({ rank: 'echo', division: 5, size: 100 }))).toEqual({ on: 1, off: 4 });
    expect(notches(render({ rank: 'echo', division: 4, size: 100 }))).toEqual({ on: 2, off: 3 });
    expect(notches(render({ rank: 'echo', division: 3, size: 100 }))).toEqual({ on: 3, off: 2 });
    expect(notches(render({ rank: 'echo', division: 2, size: 100 }))).toEqual({ on: 4, off: 1 });
    expect(notches(render({ rank: 'legende', division: 1, size: 100 }))).toEqual({ on: 5, off: 0 });
  });

  test('sans division, ni le Mythe : aucune encoche', () => {
    expect(notches(render({ rank: 'voix', size: 100 }))).toEqual({ on: 0, off: 0 });
    expect(notches(render({ rank: 'mythe', division: null, size: 100 }))).toEqual({ on: 0, off: 0 });
  });

  test('plus aucun chevron', () => {
    expect(render({ rank: 'voix', division: 3, size: 100 })).not.toContain('data-game-chevron');
  });
});

describe('le niveau gravé sur l’écu (#9636)', () => {
  test('le niveau du joueur se lit dans la pointe de l’écu', () => {
    const html = render({ rank: 'conteur', division: 2, size: 120, level: 47 });
    expect(html).toMatch(/data-game-level-engraving=""[\s\S]*?>47<\/text>/);
    expect(html.indexOf('data-game-level-engraving')).toBeGreaterThan(html.indexOf('data-game-shield'));
  });

  test('sans niveau, rien n’est gravé', () => {
    expect(render({ rank: 'conteur', division: 2, size: 120 })).not.toContain('data-game-level-engraving');
  });
});

describe('le Mythe : le halo prismatique et la Signature unique de son émission (#9636)', () => {
  test('les rayons, la gemme et le numéro d’émission gravé viennent de la table de la Signature unique', () => {
    const html = render({ rank: 'mythe', division: null, size: 160, mythic: { number: 3, edition: 57 } });
    expect(html).toContain('data-game-mythic-halo="57"');
    expect(count(/data-game-mythic-ray=/g, html)).toBe(mythicRayCount(57));
    expect(html).toContain('data-game-mythic-gem');
    expect(html).toMatch(/data-game-mythic-numeral=""[^>]*>57<\/text>/);
  });

  test('deux émissions ne dessinent pas le même halo', () => {
    const gem = (edition: number): string =>
      /<polygon[^>]*data-game-mythic-gem[^>]*>/.exec(render({ rank: 'mythe', division: null, size: 160, mythic: { number: 1, edition } }))?.[0] ?? '';
    expect(gem(1)).toContain('points=');
    expect(gem(1)).not.toBe(gem(2));
  });

  test('un ancien serveur sans place servie : le halo par défaut, sans gemme ni numéro', () => {
    const html = render({ rank: 'mythe', division: null, size: 160 });
    expect(html).toContain('data-game-mythic-halo=""');
    expect(count(/data-game-mythic-ray=/g, html)).toBe(MYTHIC_HALO_DEFAULT_RAYS);
    expect(html).not.toContain('data-game-mythic-gem');
    expect(html).not.toContain('data-game-mythic-numeral');
  });

  test('un Mythe porte aussi son niveau', () => {
    expect(render({ rank: 'mythe', division: null, size: 160, level: 100, mythic: { number: 3, edition: 57 } })).toMatch(/data-game-level-engraving=""[\s\S]*?>100<\/text>/);
  });
});

describe('le petit format, lisible à 24 px (#9636)', () => {
  test('sous 60 px, le blason se recadre sur l’écu et sa décoration, dans la même proportion', () => {
    const html = render({ rank: 'legende', division: 2, size: 24, level: 30, label: 'Légende' });
    expect(html).toContain('viewBox="30 6 140 128.8"');
    expect(html).toContain('width="24"');
    expect(html).toContain('height="22"');
    expect(birds(html)).toEqual([]);
    expect(html).not.toContain('data-game-ribbon');
    expect(html).not.toContain('data-game-level-engraving');
    expect(html).toContain('data-game-crest="legende"');
    expect(notches(html)).toEqual({ on: 4, off: 1 });
  });

  test('le Mythe en petit garde son halo, sans le numéro', () => {
    const html = render({ rank: 'mythe', division: null, size: 34, mythic: { number: 3, edition: 57 } });
    expect(html).toContain('viewBox="14 5 172 158.24"');
    expect(html).toContain('data-game-mythic-halo="57"');
    expect(html).not.toContain('data-game-mythic-numeral');
  });

  test('à 60 px et plus, le cadre entier', () => {
    expect(render({ rank: 'voix', division: 2, size: 60 })).toContain('viewBox="0 0 200 184"');
  });
});
