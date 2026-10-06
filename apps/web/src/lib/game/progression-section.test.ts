import { describe, expect, test } from 'bun:test';

import { progressionSection } from './progression-section';

/**
 * LA SECTION QUE L'ADRESSE DÉSIGNE (#9539) — le toucher d'une notification de mission ouvre la Progression À la
 * section des missions (`?section=missions`). Une valeur inconnue ne désigne rien : l'écran reste en haut.
 */
describe('progressionSection', () => {
  test('« missions » désigne la section des missions', () => {
    expect(progressionSection('missions')).toBe('game-missions');
  });

  test('tout le reste est ignoré', () => {
    for (const bad of [null, '', 'Missions', 'league', 'missions ', '#game-missions']) expect(progressionSection(bad)).toBeUndefined();
  });
});
