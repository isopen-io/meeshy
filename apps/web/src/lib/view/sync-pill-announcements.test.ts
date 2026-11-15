import { describe, expect, test } from 'bun:test';

import {
  ANNOUNCEMENT_DWELL_MS,
  ANNOUNCEMENT_MAX_WAIT_MS,
  createPillAnnouncementStore,
  currentPillAnnouncement,
  nextPillAnnouncementWake,
  type PillAnnouncement,
} from './sync-pill-announcements';

/**
 * LES ANNONCES DE LA PASTILLE (#14147) — elle fait DÉFILER ce qu'on lui confie, une annonce après l'autre, puis
 * DISPARAÎT ; elle ne revient que sur un nouvel événement. Rien n'est rangé : une annonce qui a trop attendu
 * (la pastille disait un échec d'envoi) part sans avoir été dite plutôt que de surgir, périmée.
 */

const T0 = 1_000_000;

const said = (overrides: Partial<PillAnnouncement> = {}): PillAnnouncement => ({
  id: 'a1',
  key: 'battery:ada',
  text: 'Ada : batterie critique (4 %)',
  tone: 'alert',
  icon: { kind: 'battery', level: 4, charging: false },
  at: T0,
  ...overrides,
});

describe('la file', () => {
  test('les annonces se disent dans l’ordre d’arrivée', () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    store.getState().announce(said({ id: 'a2', key: 'battery:bob', text: 'Bob' }));
    expect(currentPillAnnouncement({ queue: store.getState().queue, now: T0 })?.id).toBe('a1');
    store.getState().retire('a1');
    expect(currentPillAnnouncement({ queue: store.getState().queue, now: T0 })?.id).toBe('a2');
    store.getState().retire('a2');
    expect(currentPillAnnouncement({ queue: store.getState().queue, now: T0 })).toBeNull();
  });

  test('une nouvelle annonce de la MÊME source remplace l’ancienne : la pastille dit le présent, pas l’historique', () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    store.getState().announce(said({ id: 'a2', text: 'Ada : plus que 3 %' }));
    expect(store.getState().queue.map((entry) => entry.id)).toEqual(['a2']);
  });

  test('une annonce qui a trop attendu n’est jamais dite', () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    expect(currentPillAnnouncement({ queue: store.getState().queue, now: T0 + ANNOUNCEMENT_MAX_WAIT_MS + 1 })).toBeNull();
  });

  test('retirer une annonce inconnue ne change rien', () => {
    const store = createPillAnnouncementStore();
    store.getState().announce(said());
    const before = store.getState().queue;
    store.getState().retire('nope');
    expect(store.getState().queue).toBe(before);
  });
});

describe('le réveil', () => {
  test('la tête se retire après son temps de parole', () => {
    expect(nextPillAnnouncementWake({ shownAt: T0 })).toBe(T0 + ANNOUNCEMENT_DWELL_MS);
  });
});
