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

  test('la Signature en aplat surmonte le chiffre', () => {
    expect(render({ level: 34, tier: 'eclat', progress: 0.7, size: 56 })).toContain('data-game-signature="flat"');
  });
});

describe('LevelRing — palier et record', () => {
  test('showTier pose un point par rang de palier : Étincelle 1, Galaxie 10', () => {
    const dots = (tier: (typeof LEVEL_TIER_KEYS)[number]): number => render({ level: 1, tier, progress: 0.5, size: 72, showTier: true }).match(/data-game-tier-dot/g)?.length ?? 0;
    expect(dots('etincelle')).toBe(1);
    expect(dots('constellation')).toBe(9);
    expect(dots('galaxie')).toBe(10);
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
