import { describe, expect, test } from 'bun:test';

import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';

import { announceInactivityOnPill } from './inactivity-pill';

/**
 * L'ALERTE D'INACTIVITÉ SUR LA PASTILLE (#18738) — l'alerte se dit en rouge, le retour rassure ; une annonce de la
 * même personne remplace celle qui attend. La pastille ne range rien : elle défile, disparaît, et ne persiste jamais.
 */

const T0 = 1_700_000_000_000;
const JACQUES = 'b'.repeat(24);

describe('l’alerte d’inactivité sur la pastille', () => {
  test('l’alerte se dit en rouge, avec le sablier', () => {
    const store = createPillAnnouncementStore();
    announceInactivityOnPill({ store, userId: JACQUES, text: 'Jacques n’a pas répondu à « Tout va bien ? »', kind: 'alert', now: T0 });
    expect(store.getState().queue).toEqual([
      { id: `inactivity:${JACQUES}:alert:${T0}`, key: `inactivity:${JACQUES}`, text: 'Jacques n’a pas répondu à « Tout va bien ? »', tone: 'alert', icon: { kind: 'inactivity', responded: false }, at: T0 },
    ]);
  });

  test('le retour remplace l’alerte qui attend, et rassure', () => {
    const store = createPillAnnouncementStore();
    announceInactivityOnPill({ store, userId: JACQUES, text: 'Jacques n’a pas répondu à « Tout va bien ? »', kind: 'alert', now: T0 });
    announceInactivityOnPill({ store, userId: JACQUES, text: 'Jacques va bien', kind: 'responded', now: T0 + 1 });
    expect(store.getState().queue.map((entry) => [entry.text, entry.tone, entry.icon])).toEqual([['Jacques va bien', 'good', { kind: 'inactivity', responded: true }]]);
  });
});
