import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { LEVEL_TIER_KEYS } from '@meeshy/shared/utils/game/levels';

import { TierEmblemGlyph } from './tier-emblem';

const UID = 'ghote';

const render = (tier: (typeof LEVEL_TIER_KEYS)[number]): string =>
  renderToStaticMarkup(
    <svg viewBox="0 0 56 56">
      <TierEmblemGlyph uid={UID} tier={tier} cx={28} cy={28} size={34} />
    </svg>,
  );

/**
 * L’EMBLÈME DE PALIER (#9481) — posé DANS le SVG d’un hôte (l’anneau de
 * niveau), à la couleur spectrale du palier, la Signature au cœur ; Galaxie
 * est un spectre, dont l’hôte déclare la peinture.
 */
describe('TierEmblemGlyph', () => {
  test('un dessin par palier, qui nomme son palier', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(render(tier)).toContain(`data-game-emblem="${tier}"`);
  });

  test('vingt emblèmes, vingt dessins différents', () => {
    expect(new Set(LEVEL_TIER_KEYS.map(render)).size).toBe(20);
  });

  test('la couleur est celle du palier — un jeton, jamais un littéral', () => {
    expect(render('eclat')).toContain('var(--game-tier-eclat)');
    expect(render('eclat')).not.toMatch(/ (?:fill|stroke)="#/);
  });

  test('Galaxie est un spectre : la peinture prisme des `<defs>` de l’hôte', () => {
    expect(render('galaxie')).toContain(`url(#${UID}-p-prism)`);
  });

  test('la Signature est au cœur de chaque emblème', () => {
    for (const tier of LEVEL_TIER_KEYS) expect(render(tier)).toContain('data-game-signature="flat"');
  });
});
