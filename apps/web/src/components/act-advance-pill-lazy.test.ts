import { describe, expect, test } from 'bun:test';

import { pillOrNothing } from './act-advance-pill-lazy';

/**
 * La pastille d'acte est un DÉCOR chargé au premier envoi : hors ligne, son chunk ne se charge pas. Ce refus ne doit
 * jamais remonter au fil — sinon la conversation tombe et l'envoi en échec n'est plus rejoué au retour du réseau
 * (garde `check-thread-states`, run CI 44401776492).
 */
describe('pillOrNothing', () => {
  test('un chunk qui ne se charge pas rend un composant vide, sans rejeter', async () => {
    const loaded = await pillOrNothing(() => Promise.reject(new Error('Failed to fetch dynamically imported module')));

    expect(loaded.default({ sent: 1 })).toBeNull();
  });

  test('un chunk chargé rend la pastille elle-même', async () => {
    const Pill = () => null;

    const loaded = await pillOrNothing(() => Promise.resolve({ ActAdvancePill: Pill }));

    expect(loaded.default).toBe(Pill);
  });
});
