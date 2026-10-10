import { describe, expect, test } from 'bun:test';

import { notificationSwipeCommits, notificationSwipeOffset, notificationSwipeProgress } from './notification-swipe';

/**
 * **GLISSER UNE NOTIFICATION VERS LA GAUCHE LA SUPPRIME** (#8960, miroir du
 * `.swipeActions(edge: .trailing, allowsFullSwipe: true)` d'iOS, #8958) — la
 * loi pure : un glissé horizontal franc, vers la FIN de la ligne seulement.
 */
describe('le glissé d’une notification', () => {
  test('vers la fin de la ligne, la rangée suit le doigt', () => {
    expect(notificationSwipeOffset(-40, 2)).toBe(-40);
  });

  test('vers le début, rien ne bouge : aucune action n’y vit', () => {
    expect(notificationSwipeOffset(40, 2)).toBe(0);
  });

  test('un geste surtout vertical appartient au défilement', () => {
    expect(notificationSwipeOffset(-40, 30)).toBeNull();
  });

  test('au-delà de la zone d’action, l’élastique freine', () => {
    expect(notificationSwipeOffset(-200, 0)).toBeGreaterThan(-100);
  });

  test('relâcher au-delà du seuil supprime, en deçà annule', () => {
    expect(notificationSwipeCommits(-70)).toBe(true);
    expect(notificationSwipeCommits(-50)).toBe(false);
    expect(notificationSwipeCommits(70)).toBe(false);
  });

  test('l’avancement va de 0 à 1 jusqu’au seuil', () => {
    expect(notificationSwipeProgress(0)).toBe(0);
    expect(notificationSwipeProgress(-33)).toBeCloseTo(0.5);
    expect(notificationSwipeProgress(-200)).toBe(1);
  });
});
