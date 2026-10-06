import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';

import { TierEmblem } from './tier-emblem';

const render = (tier: (typeof LEVEL_TIER_KEYS)[number]): string => renderToStaticMarkup(<TierEmblem tier={tier} size={64} />);

/**
 * L’EMBLÈME DE PALIER (#9481) — décoratif, à la couleur spectrale du palier,
 * la Signature au cœur ; Galaxie est un spectre.
 */
describe('TierEmblem', () => {
  test('un dessin décoratif par palier, qui nomme son palier', () => {
    for (const tier of LEVEL_TIER_KEYS) {
      const html = render(tier);
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain(`data-game-emblem="${tier}"`);
    }
  });

  test('dix emblèmes, dix dessins différents', () => {
    expect(new Set(LEVEL_TIER_KEYS.map(render)).size).toBe(10);
  });

  test('la couleur est celle du palier — un jeton, jamais un littéral', () => {
    expect(render('eclat')).toContain('var(--game-tier-eclat)');
    expect(render('eclat')).not.toMatch(/ (?:fill|stroke)="#/);
  });

  test('Galaxie est un spectre : la peinture prisme, déclarée dans le dessin', () => {
    const html = render('galaxie');
    expect(html).toMatch(/fill="url\(#([^)]+)-p-prism\)"/);
    const id = /url\(#([^)]+-p-prism)\)/.exec(html)?.[1] ?? '';
    expect(html).toContain(`id="${id}"`);
  });

  test('la Signature est au cœur de chaque emblème', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(render(tier)).toContain('data-game-signature="flat"');
  });
});
