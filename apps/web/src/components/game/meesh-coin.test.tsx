import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import coin from '@meeshy/shared/design/meesh-coin.json';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';

import { MeeshCoin, MeeshCoinFlip, type MeeshCoinSide } from './meesh-coin';

/**
 * LA MEESH, AVERS ET REVERS (#9380, épopée § 6, #11176).
 *
 *   · AVERS, pour toutes les éditions : la Signature frappée, la couronne
 *     UNIVERSELLE « MEESHY · 1 MEESH » (jamais traduite), la tranche cannelée ;
 *   · REVERS : l'oiseau ou les oiseaux de l'édition — Mee (argent), Meo (or),
 *     Mee et Meo (prisme) —, l'année et « Nº » (le o en exposant, SOULIGNÉ,
 *     le nombre en petit) ;
 *   · MATIÈRES : argent veiné d'or, or PUR (centre compris), or mêlé de diamant ;
 *   · DÉCORS, lus dans la géométrie partagée (`packages/shared/design/meesh-coin.json`,
 *     que iOS rejoue) : argent sobre, or raffiné, prisme royal.
 */

const EDITIONS: readonly MeeshEdition[] = ['silver', 'gold', 'prism'];
const SIDES: readonly MeeshCoinSide[] = ['obverse', 'reverse'];

const face = (side: MeeshCoinSide, edition: MeeshEdition = 'silver'): string =>
  renderToStaticMarkup(<MeeshCoin side={side} size={120} edition={edition} number={92} year={2026} />);

const count = (html: string, needle: string): number => html.split(needle).length - 1;

const decors = (html: string): readonly string[] => [...html.matchAll(/data-game-decor="([a-z-]+)"/g)].map((m) => m[1] ?? '');

/** La couronne lue dans l'ordre de son pourtour : chaque lettre, et chaque séparateur (point ou étoile) lu « · ». */
const crownReading = (html: string): string =>
  [...html.matchAll(/data-game-ring-glyph="([^"]*)" data-game-ring-index="(\d+)"/g)]
    .map((m) => ({ glyph: m[1] ?? '', index: Number(m[2]) }))
    .sort((a, b) => a.index - b.index)
    .map((g) => g.glyph)
    .join('');

describe('MeeshCoin — l’avers', () => {
  const html = face('obverse');

  test('un disque de 120, décoratif', () => {
    expect(html).toContain('viewBox="0 0 120 120"');
    expect(html).toContain('width="120"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-face="obverse"');
  });

  test('la Signature est FRAPPÉE : ombre, éclat, encre', () => {
    expect(html).toContain('data-game-signature="struck"');
    expect(html).toContain('stroke="var(--game-shade)"');
  });

  test('la couronne est universelle : « MEESHY · 1 MEESH », deux fois, dans toutes les éditions', () => {
    for (const edition of EDITIONS) {
      expect(crownReading(face('obverse', edition))).toBe('MEESHY·1MEESH·MEESHY·1MEESH·');
    }
  });

  test('la couronne n’est plus localisée : la pièce ne reçoit aucune inscription', () => {
    // @ts-expect-error — `inscription` a disparu (épopée § 6) : la couronne ne se traduit plus.
    const html2 = renderToStaticMarkup(<MeeshCoin side="obverse" size={90} inscription="MEESHY · ONE MEESH" />);
    expect(html2).not.toContain('ONE');
    expect(crownReading(html2)).toBe('MEESHY·1MEESH·MEESHY·1MEESH·');
  });

  test('la tranche est cannelée : un cercle en pointillé', () => {
    expect(html).toMatch(/stroke-dasharray="1\.4 2"/);
  });

  test('porte le trait de reflet que le moteur ou le repli CSS fait balayer', () => {
    expect(html).toContain('data-game-sheen');
  });

  test('pas d’oiseau à l’avers', () => {
    for (const edition of EDITIONS) expect(face('obverse', edition)).not.toContain('data-game-bird');
  });
});

describe('MeeshCoin — le revers porte l’oiseau ou les oiseaux de l’édition', () => {
  const birds = (html: string): readonly string[] => [...html.matchAll(/data-game-bird="([A-Za-z]+)"/g)].map((m) => m[1] ?? '');

  test('argent : Mee', () => {
    expect(birds(face('reverse', 'silver'))).toEqual(['meeJoy']);
  });

  test('or : Meo', () => {
    expect(birds(face('reverse', 'gold'))).toEqual(['meoOpen']);
  });

  test('prisme : Mee et Meo face à face, Meo retourné', () => {
    const html = face('reverse', 'prism');
    expect(birds(html)).toEqual(['meeJoy', 'meoOpen']);
    expect(html).toMatch(/data-game-bird="meoOpen" transform="translate\([\d.]+ [\d.]+\) scale\(-[\d.]+ [\d.]+\)"/);
  });

  test('les oiseaux sont ceux que la géométrie partagée pose', () => {
    for (const edition of EDITIONS) {
      expect(birds(face('reverse', edition))).toEqual(coin.editions[edition].birds.map((b) => b.bird));
    }
  });

  test('ils sont GRAVÉS dans le métal, colorés, jamais en autocollant (#9540)', () => {
    const html = face('reverse', 'prism');
    expect(html).toMatch(/filter="url\(#[^)]*-engrave\)"/);
    expect(html).not.toContain('-cut"');
    expect(html).not.toContain('dilate');
  });
});

describe('MeeshCoin — « Nº », le o en exposant souligné, le nombre en petit', () => {
  const html = face('reverse');

  test('le numéro est porté par la pièce, en chiffres', () => {
    expect(html).toContain('data-game-number="92"');
  });

  test('« N », puis le o en EXPOSANT et SOULIGNÉ, puis le nombre', () => {
    expect(html).toMatch(/data-game-number="92"[^>]*>N<tspan data-game-number-ordinal=""[^>]*>o<\/tspan><tspan data-game-number-value=""[^>]*>92<\/tspan>/);
    expect(html).toMatch(/data-game-number-ordinal=""[^>]*text-decoration="underline"/);
    expect(html).toMatch(/data-game-number-ordinal=""[^>]*dy="-/);
  });

  test('le nombre est plus petit que le N', () => {
    const sign = Number(/data-game-number="92"[^>]*font-size="([\d.]+)"/.exec(html)?.[1]);
    const value = Number(/data-game-number-value=""[^>]*font-size="([\d.]+)"/.exec(html)?.[1]);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(sign);
  });

  test('le libellé n’est plus localisé : la pièce ne reçoit aucun libellé', () => {
    // @ts-expect-error — `numberLabel` a disparu (épopée § 6) : « Nº » s'écrit pareil dans toutes les langues.
    const html2 = renderToStaticMarkup(<MeeshCoin side="reverse" size={100} number={13} numberLabel="No. 13" />);
    expect(html2).not.toContain('No. 13');
    expect(html2).toContain('data-game-number="13"');
  });

  test('l’année', () => {
    expect(html).toContain('>2026<');
  });

  test('sans numéro, aucun numéro inventé', () => {
    expect(renderToStaticMarkup(<MeeshCoin side="reverse" size={100} />)).not.toContain('data-game-number');
  });
});

describe('MeeshCoin — les matières', () => {
  test('argent : le métal et le champ d’argent, veinés d’un peu d’or', () => {
    for (const side of SIDES) {
      const html = face(side, 'silver');
      expect(html).toContain('-p-coin-silver)');
      expect(html).toContain('-p-coin-silver-in)');
      expect(html).toContain('data-game-decor="veins"');
      expect(html).toContain('stroke="var(--game-coin-vein)"');
    }
  });

  test('or : de l’or PUR, centre compris — plus aucun argent', () => {
    for (const side of SIDES) {
      const html = face(side, 'gold');
      expect(html).toContain('-p-coin-gold)');
      expect(html).toContain('-p-coin-gold-in)');
      expect(html).not.toContain('coin-silver');
    }
  });

  test('prisme : de l’or mêlé de diamant, la tranche irisée, des éclats qui scintillent', () => {
    for (const side of SIDES) {
      const html = face(side, 'prism');
      expect(html).toContain('-p-prism)');
      expect(html).toContain('-p-coin-diamond-in)');
      expect(html).not.toContain('coin-silver');
      expect(html).toMatch(/data-game-decor="iris"[^>]*stroke="url\(#[^)]*-iris\)"/);
      expect(count(html, 'data-game-sparkle=')).toBe(coin.decor.sparkles.points.length);
    }
  });

  test('chaque édition a son propre attribut pour le moteur d’irisation', () => {
    for (const edition of EDITIONS) expect(face('obverse', edition)).toContain(`data-game-edition="${edition}"`);
  });

  test('aucun littéral de couleur', () => {
    for (const edition of EDITIONS) {
      for (const side of SIDES) expect(face(side, edition)).not.toMatch(/(stroke|fill|stop-color)="#/);
    }
  });
});

describe('MeeshCoin — les décors de chaque édition, lus dans la géométrie partagée', () => {
  test('argent : SOBRE — la tranche et la couronne, rien de plus', () => {
    expect(decors(face('obverse', 'silver'))).toEqual(['veins']);
    expect(decors(face('reverse', 'silver'))).toEqual(['veins']);
  });

  test('or : RAFFINÉ — grènetis fin, rosace guillochée, lauriers autour du numéro, étoiles dans la couronne', () => {
    expect(decors(face('obverse', 'gold'))).toEqual(['beads', 'rosette', 'stars']);
    expect(decors(face('reverse', 'gold'))).toEqual(['beads', 'rosette', 'laurels']);
  });

  test('prisme : ROYAL — double grènetis, cabochons, soleil guilloché, couronne, éclats, tranche irisée', () => {
    expect(decors(face('obverse', 'prism'))).toEqual(['iris', 'beads', 'cabochons', 'sunburst', 'sparkles']);
    expect(decors(face('reverse', 'prism'))).toEqual(['iris', 'beads', 'cabochons', 'sunburst', 'crown', 'sparkles']);
  });

  test('la liste des décors de chaque face est celle de la géométrie partagée', () => {
    for (const edition of EDITIONS) {
      for (const side of SIDES) expect(decors(face(side, edition))).toEqual(coin.editions[edition].decor[side]);
    }
  });

  test('le grènetis de l’or : une couronne de perles ; celui du prisme : deux', () => {
    const beads = (edition: MeeshEdition): number => count(face('obverse', edition), 'data-game-bead=');
    expect(beads('gold')).toBe(coin.decor.beads.gold.reduce((n, ring) => n + ring.count, 0));
    expect(coin.decor.beads.gold).toHaveLength(1);
    expect(coin.decor.beads.prism).toHaveLength(2);
    expect(beads('prism')).toBe(coin.decor.beads.prism.reduce((n, ring) => n + ring.count, 0));
  });

  test('huit cabochons de diamant taillés autour du bord du prisme', () => {
    expect(count(face('obverse', 'prism'), 'data-game-cabochon=')).toBe(8);
    expect(coin.decor.cabochons.count).toBe(8);
  });

  test('les petites étoiles de l’or remplacent les points de la couronne', () => {
    const html = face('obverse', 'gold');
    expect(count(html, 'data-game-ring-star=')).toBe(4);
    expect(count(face('obverse', 'silver'), 'data-game-ring-star=')).toBe(0);
  });

  test('deux rameaux de laurier encadrent le numéro de l’or', () => {
    expect(count(face('reverse', 'gold'), 'data-game-laurel=')).toBe(2);
  });

  test('la couronne royale coiffe Mee et Meo, au revers du prisme seulement', () => {
    expect(face('reverse', 'prism')).toContain('data-game-decor="crown"');
    expect(face('obverse', 'prism')).not.toContain('data-game-decor="crown"');
    expect(face('reverse', 'gold')).not.toContain('data-game-decor="crown"');
  });
});

describe('MeeshCoin — instances', () => {
  test('deux pièces sur une page ne partagent aucun identifiant', () => {
    const ids = (h: string): readonly string[] => [...h.matchAll(/ id="([^"]+)"/g)].map((m) => m[1] ?? '');
    for (const edition of EDITIONS) {
      const a = ids(renderToStaticMarkup(<MeeshCoin side="reverse" size={50} edition={edition} number={1} />));
      expect(a.length).toBeGreaterThan(2);
      expect(new Set(a).size).toBe(a.length);
    }
  });
});

describe('MeeshCoinFlip — la pièce qui se retourne sur son numéro', () => {
  test('les deux faces sont superposées ; la face montrée est la seule visible', () => {
    const html = renderToStaticMarkup(<MeeshCoinFlip size={120} face="obverse" number={7} year={2026} />);
    expect(html).toContain('data-game-face="obverse"');
    expect(html).toContain('data-game-face="reverse"');
    expect(html).toContain('data-game-coin-flip');
    expect(html.match(/opacity:0/g)).toHaveLength(1);
  });

  test('retournée, c’est le revers qui est visible', () => {
    const html = renderToStaticMarkup(<MeeshCoinFlip size={120} face="reverse" number={7} year={2026} />);
    expect(html).toMatch(/opacity:0" data-game-face-wrap="obverse"/);
    expect(html).toMatch(/opacity:1" data-game-face-wrap="reverse"/);
  });
});
