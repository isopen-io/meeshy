import { describe, expect, test } from 'bun:test';

import type { FriendActionOutcome } from '@/lib/api/friend-actions';

import { announcementToneOf } from './announcement-tone';

/**
 * **UN ÉCHEC NE SE LIT PAS COMME UNE RÉUSSITE** (revue #7083, défaut
 * majeur 3) — et les DEUX surfaces qui servent ces gestes lisent la même loi.
 */
describe('announcementToneOf', () => {
  test('une réussite reste neutre', () => {
    expect(announcementToneOf('done')).toBe('neutral');
  });

  test('un refus porte l’encre d’erreur', () => {
    expect(announcementToneOf('failed')).toBe('error');
  });

  test('« hors ligne » AUSSI : rien n’est parti, c’est un échec — pas une nuance', () => {
    expect(announcementToneOf('offline')).toBe('error');
  });

  test('la correspondance est TOTALE — une quatrième issue ne pourrait pas rester muette', () => {
    const outcomes: readonly FriendActionOutcome[] = ['done', 'offline', 'failed'];
    expect(outcomes.map(announcementToneOf)).toEqual(['neutral', 'error', 'error']);
  });
});
