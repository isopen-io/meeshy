import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { EngagementTier } from '@meeshy/shared/utils/engagement-progress';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { TierDots } from './progression-parts';

/**
 * LES PASTILLES DE PALIER PARLENT LA LANGUE DU LECTEUR (iter-78w) — le nom
 * accessible de la liste (`<ol aria-label>`) et de chaque pastille (`<li
 * aria-label>`) était écrit EN DUR en français. Un lecteur d'écran en anglais
 * (ou toute autre des sept langues) entendait « Paliers de … », « Palier N
 * atteint », « Palier N à atteindre ». Ces chaînes viennent désormais du
 * catalogue du jeu (`game.progression.tier.*`, partie `concept`).
 */

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all((['en', 'fr'] as const).map((language) => loadGameCatalog(language)));
});

afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const tiers: readonly EngagementTier[] = [
  { threshold: 50, reached: true, reachedAt: '2026-09-03T10:00:00.000Z' },
  { threshold: 100, reached: true, reachedAt: null },
  { threshold: 500, reached: false, reachedAt: null },
];

const rendered = (lang: 'en' | 'fr'): string => {
  document.documentElement.lang = lang;
  return renderToStaticMarkup(<TierDots tiers={tiers} tint="#6366F1" axisLabel="Text messages" />);
};

describe('TierDots — noms accessibles traduits', () => {
  test('en anglais : la liste et les pastilles n’ont plus un mot de français', () => {
    const html = rendered('en');
    expect(html).toContain('aria-label="Tiers of Text messages"');
    expect(html).toContain('aria-label="Tier 100 reached"');
    expect(html).toContain('aria-label="Tier 500 to reach"');
    expect(html).toContain('Tier 50 reached on September 3, 2026');
    expect(html).not.toMatch(/Palier|Paliers de|atteint|à atteindre/u);
  });

  test('en français : le câblage et la formulation restent', () => {
    const html = rendered('fr');
    expect(html).toContain('aria-label="Paliers de Text messages"');
    expect(html).toContain('aria-label="Palier 100 atteint"');
    expect(html).toContain('aria-label="Palier 500 à atteindre"');
    expect(html).toMatch(/Palier 50 atteint le 3 septembre 2026/u);
  });
});
