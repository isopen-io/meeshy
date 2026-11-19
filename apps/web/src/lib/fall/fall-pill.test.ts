import { describe, expect, test } from 'bun:test';

import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';

import { announceFallOnPill } from './fall-pill';

/**
 * LA CHUTE DÉTECTÉE SUR LA PASTILLE (#18748) — la chute se dit en rouge, le retour rassure ; une annonce de la même
 * personne remplace celle qui attend. La pastille ne range rien : elle défile, disparaît, et ne persiste jamais.
 */

const T0 = 1_700_000_000_000;
const AWA = 'b'.repeat(24);

describe('la chute détectée sur la pastille', () => {
  test('la chute se dit en rouge, avec la silhouette', () => {
    const store = createPillAnnouncementStore();
    announceFallOnPill({ store, userId: AWA, text: 'Une chute a été détectée sur la montre de Awa', kind: 'detected', now: T0 });
    expect(store.getState().queue).toEqual([
      { id: `fall:${AWA}:detected:${T0}`, key: `fall:${AWA}`, text: 'Une chute a été détectée sur la montre de Awa', tone: 'alert', icon: { kind: 'fall', responded: false }, at: T0 },
    ]);
  });

  test('le retour remplace la chute qui attend, et rassure', () => {
    const store = createPillAnnouncementStore();
    announceFallOnPill({ store, userId: AWA, text: 'Une chute a été détectée sur la montre de Awa', kind: 'detected', now: T0 });
    announceFallOnPill({ store, userId: AWA, text: 'Awa va bien', kind: 'responded', now: T0 + 1 });
    expect(store.getState().queue.map((entry) => [entry.text, entry.tone, entry.icon])).toEqual([['Awa va bien', 'good', { kind: 'fall', responded: true }]]);
  });
});
