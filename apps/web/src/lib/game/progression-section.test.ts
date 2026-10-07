import { describe, expect, test } from 'bun:test';

import { progressionSection } from './progression-section';

/**
 * LA SECTION QUE L'ADRESSE DÉSIGNE (#9539, #9563) — le toucher d'une notification de mission ouvre la FICHE des
 * missions (`?section=missions`). Une valeur inconnue ne désigne rien : la première page reste affichée.
 */
describe('progressionSection', () => {
  test('« missions » désigne la fiche des missions', () => {
    expect(progressionSection('missions')).toBe('missions');
  });

  test('tout le reste est ignoré', () => {
    for (const bad of [null, '', 'Missions', 'league', 'missions ', '#game-missions']) expect(progressionSection(bad)).toBeUndefined();
  });
});
