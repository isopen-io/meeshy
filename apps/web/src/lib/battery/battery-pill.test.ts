import { describe, expect, test } from 'bun:test';

import type { NotificationRecord } from '@/lib/notifications/record';
import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';

import { announceBatteryNotification, announceBatteryOnPill, batteryPillTone } from './battery-pill';

/**
 * LA BATTERIE SUR LA PASTILLE (#14147) — deux portes, une seule file : l'annonce que la socket sert (canal
 * `socket`) et la notification `device_battery` reçue onglet OUVERT (canal `push`), que la pastille dit À LA PLACE
 * de la bannière : jamais les deux pour un même palier.
 */

const T0 = 1_700_000_000_000;
const ADA = 'b'.repeat(24);

const record = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'n1',
  type: 'device_battery',
  title: 'Ada n’a presque plus de batterie',
  content: 'Batterie à 4 %',
  actor: { id: ADA, username: 'ada', displayName: 'Ada', avatar: null },
  context: {},
  metadata: { batteryKind: 'critical' },
  state: { isRead: false, createdAt: '2026-11-15T10:00:00.000Z' },
  ...overrides,
});

describe('la teinte d’une annonce', () => {
  test('le critique et l’extinction alertent, la faiblesse avertit, le retour rassure', () => {
    expect(batteryPillTone('critical')).toBe('alert');
    expect(batteryPillTone('critical-drop')).toBe('alert');
    expect(batteryPillTone('probably-off')).toBe('alert');
    expect(batteryPillTone('low')).toBe('warn');
    expect(batteryPillTone('threshold')).toBe('warn');
    expect(batteryPillTone('charging')).toBe('good');
    expect(batteryPillTone('recharged')).toBe('good');
    expect(batteryPillTone('ended')).toBe('good');
  });
});

describe('les annonces d’une même personne se remplacent', () => {
  test('la pastille dit le dernier palier', () => {
    const store = createPillAnnouncementStore();
    announceBatteryOnPill({ store, userId: ADA, text: 'Ada : batterie faible (28 %)', kind: 'low', level: 28, charging: false, now: T0 });
    announceBatteryOnPill({ store, userId: ADA, text: 'Ada : batterie critique (5 %)', kind: 'critical', level: 5, charging: false, now: T0 + 1 });
    expect(store.getState().queue.map((entry) => entry.text)).toEqual(['Ada : batterie critique (5 %)']);
    expect(store.getState().queue[0]?.tone).toBe('alert');
  });
});

describe('la notification reçue onglet ouvert', () => {
  test('devient une annonce de la pastille, au texte composé par le serveur', () => {
    const store = createPillAnnouncementStore();
    expect(announceBatteryNotification(record(), { store, now: T0 })).toBe(true);
    expect(store.getState().queue[0]).toMatchObject({ key: `battery:${ADA}`, text: 'Ada n’a presque plus de batterie · Batterie à 4 %', tone: 'alert' });
  });

  test('une notification déjà lue, ou d’un autre type, ne dit rien', () => {
    const store = createPillAnnouncementStore();
    expect(announceBatteryNotification(record({ state: { isRead: true, createdAt: '2026-11-15T10:00:00.000Z' } }), { store, now: T0 })).toBe(false);
    expect(announceBatteryNotification(record({ type: 'friend_request' }), { store, now: T0 })).toBe(false);
    expect(store.getState().queue).toEqual([]);
  });

  test('un palier inconnu se dit en teinte d’alerte, faute de mieux', () => {
    const store = createPillAnnouncementStore();
    announceBatteryNotification(record({ metadata: {} }), { store, now: T0 });
    expect(store.getState().queue[0]?.tone).toBe('alert');
  });
});
