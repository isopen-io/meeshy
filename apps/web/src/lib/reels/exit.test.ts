import { describe, expect, test } from 'bun:test';

import { reelsExitOf } from './exit';

/**
 * LA SORTIE DES RÉELS (#6498) — le bouton « Retour » recule l'historique
 * seulement quand l'entrée précédente est dans Meeshy, et REMPLACE l'adresse
 * par le Flux sinon. `history.length` compte aussi les pages des AUTRES sites :
 * un lien `/reels?seed=` ouvert après une page tierce y ramenait (mesuré).
 */
describe('la sortie des Réels ne quitte jamais l’application', () => {
  test('l’API Navigation dit qu’aucune entrée de Meeshy ne précède : le Flux, même avec un historique long', () => {
    expect(reelsExitOf({ canGoBack: false, historyLength: 3, onLandingEntry: true })).toBe('feed');
  });

  test('l’API Navigation dit qu’une entrée de Meeshy précède : on recule', () => {
    expect(reelsExitOf({ canGoBack: true, historyLength: 4, onLandingEntry: false })).toBe('back');
  });

  test('sans API Navigation, l’entrée d’ARRIVÉE sur le site : le Flux, quelle que soit la longueur de l’historique', () => {
    expect(reelsExitOf({ canGoBack: undefined, historyLength: 3, onLandingEntry: true })).toBe('feed');
  });

  test('sans API Navigation, une entrée poussée par l’application : on recule', () => {
    expect(reelsExitOf({ canGoBack: undefined, historyLength: 2, onLandingEntry: false })).toBe('back');
  });

  test('sans API Navigation, un historique d’une seule entrée : le Flux', () => {
    expect(reelsExitOf({ canGoBack: undefined, historyLength: 1, onLandingEntry: false })).toBe('feed');
  });
});
