import { describe, expect, test } from 'bun:test';

import { SYNC_PILL_TOP_BAND, SYNC_PILL_TOP_DEFAULT, syncPillTop } from './sync-pill-offset';

/**
 * `.sync-pill` recouvrait le centre du rail des quatre écrans à seconde bande
 * (#6401, #6387) : la pastille posée à 72 px tombe en plein milieu d'une
 * bande qui finit entre 116 et 120. Le témoin fige la liste FERMÉE des
 * routes concernées, plutôt que la géométrie d'un seul écran — c'est la
 * fuite d'une route oubliée que ce fichier a pour rôle d'empêcher.
 */
describe('syncPillTop', () => {
  for (const routeKey of ['discover', 'calls', 'communities', 'notifications']) {
    test(`${routeKey} porte la seconde bande : la pastille descend sous elle`, () => {
      expect(syncPillTop(routeKey)).toBe(SYNC_PILL_TOP_BAND);
    });
  }

  for (const routeKey of ['list', 'feed', 'links', 'settings', 'profile', '']) {
    test(`${routeKey || '(racine)'} n’a qu’un en-tête : la pastille garde le défaut`, () => {
      expect(syncPillTop(routeKey)).toBe(SYNC_PILL_TOP_DEFAULT);
    });
  }

  test('les deux cotes restent distinctes — sinon la bande ne change plus rien', () => {
    expect(SYNC_PILL_TOP_BAND).toBeGreaterThan(SYNC_PILL_TOP_DEFAULT);
  });
});
