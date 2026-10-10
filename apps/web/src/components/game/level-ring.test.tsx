import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';

import { LevelRing } from './level-ring';

const render = (props: Parameters<typeof LevelRing>[0]): string => renderToStaticMarkup(<LevelRing {...props} />);
const CIRCUMFERENCE = 2 * Math.PI * 24;
const arcOf = (html: string): number => Number(/data-game-ring-arc[^>]*stroke-dasharray="([\d.]+) /.exec(html)?.[1] ?? Number.NaN);

/**
 * L’ANNEAU DE NIVEAU (#9380) — la jauge de progression du niveau, à la couleur
 * de son PALIER, avec la Signature au-dessus du chiffre. Le niveau RECORD
 * (celui d’avant une frappe) reste visible : une frappe fait baisser l’anneau,
 * jamais l’histoire.
 */
describe('LevelRing — l’anneau', () => {
  test('un carré de 56, décoratif, qui porte le niveau et le palier', () => {
    const html = render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 });
    expect(html).toContain('viewBox="0 0 56 56"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('data-game-level="34"');
    expect(html).toContain('data-game-tier="eclat"');
    expect(html).toContain('>34<');
  });

  test('l’arc couvre la fraction de la circonférence — jamais plus d’un tour', () => {
    expect(arcOf(render({ level: 3, tier: 'etincelle', progress: 0.5, size: 56 }))).toBeCloseTo(CIRCUMFERENCE / 2, 0);
    expect(arcOf(render({ level: 3, tier: 'etincelle', progress: 4, size: 56 }))).toBeCloseTo(CIRCUMFERENCE, 0);
    expect(arcOf(render({ level: 3, tier: 'etincelle', progress: -1, size: 56 }))).toBe(0);
  });

  test('sans jauge (le niveau d’un AUTRE, dont la progression n’est pas servie) : un anneau plein et statique, jamais une fausse part', () => {
    const html = render({ level: 34, tier: 'eclat', progress: null, size: 56 });
    expect(arcOf(html)).toBeCloseTo(CIRCUMFERENCE, 0);
    expect(html).toContain('data-game-ring-static');
    expect(render({ level: 34, tier: 'eclat', progress: 0.5, size: 56 })).not.toContain('data-game-ring-static');
  });

  test('une progression illisible donne un anneau vide, jamais NaN', () => {
    const html = render({ level: 3, tier: 'etincelle', progress: Number.NaN, size: 56 });
    expect(html).not.toContain('NaN');
    expect(arcOf(html)).toBe(0);
  });

  test('l’anneau part de midi et tourne dans le sens des aiguilles', () => {
    expect(render({ level: 1, tier: 'etincelle', progress: 0.2, size: 56 })).toContain('rotate(-90 28 28)');
  });

  test('la couleur est celle du palier — un jeton, pas un littéral', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 })).toContain('stroke="var(--game-tier-eclat)"');
    expect(render({ level: 51, tier: 'aurore', progress: 0.1, size: 56 })).toContain('stroke="var(--game-tier-aurore)"');
  });

  test('le dernier palier, Galaxie, est un spectre', () => {
    expect(render({ level: 95, tier: 'galaxie', progress: 0.3, size: 56 })).toMatch(/stroke="url\(#[^)]+-p-prism\)"/);
  });

  test('chaque palier est dessinable', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(render({ level: 1, tier, progress: 0.5, size: 56 })).toContain(`data-game-tier="${tier}"`);
  });

  test('la Signature, au cœur de l’emblème du palier, reste dans le disque', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 })).toContain('data-game-signature="flat"');
  });
});

/**
 * L’ANNEAU PORTE SON PALIER (#9481) — dans le disque central : l’EMBLÈME du
 * palier en filigrane transparent, le niveau en chiffres arabes au premier
 * plan, et le palier en CHIFFRES ROMAINS (I à X) dans un cartouche au contour
 * détouré, sous le niveau.
 */
describe('LevelRing — l’emblème, le niveau et le palier en chiffres romains', () => {
  const html = render({ level: 34, tier: 'eclat', progress: 0.7, size: 72 });

  test('le disque central est un fond posé sous l’emblème', () => {
    expect(html).toMatch(/data-game-disc=""[^>]*fill="var\(--ios-surface-card\)"/);
  });

  test('l’emblème du palier est imprimé en filigrane : transparent, dessiné avant le niveau (donc derrière lui)', () => {
    expect(html).toContain('data-game-emblem="eclat"');
    const opacity = Number(/data-game-emblem="eclat" opacity="([\d.]+)"/.exec(html)?.[1] ?? Number.NaN);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThanOrEqual(0.3);
    expect(html.indexOf('data-game-emblem')).toBeLessThan(html.indexOf('data-game-level-text'));
  });

  test('chaque palier imprime SON emblème', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(render({ level: 1, tier, progress: 0.2, size: 72 })).toContain(`data-game-emblem="${tier}"`);
  });

  test('le niveau reste en chiffres arabes, au premier plan', () => {
    expect(html).toMatch(/data-game-level-text=""[^>]*>34</);
    expect(html.indexOf('data-game-level-text')).toBeGreaterThan(html.indexOf('data-game-emblem'));
  });

  test('le palier s’écrit en chiffres romains, de I à XX, dans un cartouche', () => {
    const numeral = (tier: (typeof LEVEL_TIER_KEYS)[number]): string =>
      />([IVX]+)<\/text>/.exec(render({ level: 1, tier, progress: 0.2, size: 72 }).split('data-game-tier-numeral')[1] ?? '')?.[1] ?? '';
    expect(LEVEL_TIER_KEYS.map(numeral)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']);
    expect(html).toContain('data-game-tier-cartouche');
  });

  test('le chiffre romain est DÉTOURÉ : un contour, tracé sous le remplissage', () => {
    const numeral = /<text[^>]*data-game-tier-numeral[^>]*>/.exec(html)?.[0] ?? '';
    expect(numeral).toMatch(/stroke="var\(--game-edge\)"/);
    expect(numeral).toMatch(/paint-order="stroke"/);
    expect(numeral).toMatch(/stroke-width="[\d.]+"/);
  });

  test('le cartouche est du palier — son jeton, ou le prisme pour Galaxie', () => {
    expect(html).toMatch(/data-game-tier-cartouche=""[^>]*fill="var\(--game-tier-eclat\)"/);
    expect(render({ level: 95, tier: 'galaxie', progress: 0.3, size: 72 })).toMatch(/data-game-tier-cartouche=""[^>]*fill="url\(#[^)]+-p-prism\)"/);
  });

  test('un niveau à trois chiffres se réduit pour tenir dans le disque', () => {
    const size = (level: number): number => Number(/data-game-level-text=""[^>]*font-size="([\d.]+)"/.exec(render({ level, tier: 'galaxie', progress: 1, size: 72 }))?.[1] ?? Number.NaN);
    expect(size(100)).toBeLessThan(size(34));
    expect(size(7)).toBe(size(34));
  });

  test('un niveau à quatre chiffres se réduit encore, et au-delà aussi (#9688)', () => {
    const size = (level: number): number => Number(/data-game-level-text=""[^>]*font-size="([\d.]+)"/.exec(render({ level, tier: 'singularite', progress: 0.4, size: 72 }))?.[1] ?? Number.NaN);
    expect(size(1000)).toBeLessThan(size(499));
    expect(size(12_345)).toBeLessThan(size(1000));
    expect(size(499)).toBe(size(100));
  });
});

describe('LevelRing — le lecteur d’écran', () => {
  test('sans libellé, le dessin est décoratif (l’hôte dit le niveau)', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 })).toContain('aria-hidden="true"');
  });

  test('avec un libellé, l’anneau est une image nommée — et ne se masque plus', () => {
    const html = render({ level: 34, tier: 'eclat', progress: 0.7, size: 56, label: 'Niveau 34, palier Éclat, quatrième palier' });
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Niveau 34, palier Éclat, quatrième palier"');
    expect(html).not.toContain('aria-hidden');
  });
});

describe('LevelRing — les cibles de la chorégraphie', () => {
  const html = render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 });

  test('l’arc est enveloppé : la rotation de départ (-90°) reste intacte quand le geste anime le groupe', () => {
    expect(html).toMatch(/<g data-game-ring-sweep=""><circle data-game-ring-arc=""[^>]*rotate\(-90 28 28\)/);
  });

  test('le chiffre est ciblable : « le chiffre roule »', () => {
    expect(html).toContain('data-game-level-text');
  });
});

describe('LevelRing — palier et record', () => {
  test('showTier pose un point par rang de palier : Étincelle 1, Galaxie 10', () => {
    const dots = (tier: (typeof LEVEL_TIER_KEYS)[number]): number => render({ level: 1, tier, progress: 0.5, size: 72, showTier: true }).match(/data-game-tier-dot/g)?.length ?? 0;
    expect(dots('etincelle')).toBe(1);
    expect(dots('constellation')).toBe(9);
    expect(dots('galaxie')).toBe(10);
    expect(dots('singularite')).toBe(20);
  });

  test('sans showTier, aucun point de palier', () => {
    expect(render({ level: 1, tier: 'galaxie', progress: 0.5, size: 72 })).not.toContain('data-game-tier-dot');
  });

  test('le record au-dessus du niveau se marque d’un losange ; au niveau du record, rien', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56, record: 36 })).toContain('data-game-record="36"');
    expect(render({ level: 36, tier: 'eclat', progress: 0.7, size: 56, record: 36 })).not.toContain('data-game-record');
    expect(render({ level: 36, tier: 'eclat', progress: 0.7, size: 56 })).not.toContain('data-game-record');
  });

  test('aucun littéral de couleur', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56, record: 40, showTier: true })).not.toMatch(/ (?:fill|stroke|stop-color)="#/);
  });
});

describe('LevelRing — les étoiles de Prestige (#9389)', () => {
  const render = (prestige: number): string => renderToStaticMarkup(<LevelRing level={12} tier="lueur" progress={0.4} size={96} prestige={prestige} />);

  test('autant d’étoiles que de Prestiges, cinq au plus', () => {
    expect((render(0).match(/data-game-prestige-star/g) ?? []).length).toBe(0);
    expect((render(2).match(/data-game-prestige-star/g) ?? []).length).toBe(2);
    expect((render(9).match(/data-game-prestige-star/g) ?? []).length).toBe(5);
  });

  test('les étoiles gagnent une marge ; sans étoile, l’anneau garde sa boîte d’origine', () => {
    expect(render(1)).toContain('viewBox="-8 -8 72 72"');
    expect(render(0)).toContain('viewBox="0 0 56 56"');
  });

  test('une valeur illisible ne pose aucune étoile', () => {
    expect((render(Number.NaN).match(/data-game-prestige-star/g) ?? []).length).toBe(0);
    expect((render(-3).match(/data-game-prestige-star/g) ?? []).length).toBe(0);
  });

  test('l’étoile est un aplat or, sans littéral de couleur', () => {
    expect(render(1)).toContain('fill="var(--game-gold-1)"');
  });
});
