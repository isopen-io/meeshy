import { describe, expect, test } from 'bun:test';

import { decodeNotification, type NotificationRecord } from '@/lib/notifications/record';
import { createPillAnnouncementStore } from '@/lib/view/sync-pill-announcements';

import { announcePhoneReachabilityNotification, announcePhoneReachabilityOnPill, phoneReachabilityPillTone } from './phone-reachability-pill';

/**
 * LE TÉLÉPHONE INJOIGNABLE SUR LA PASTILLE (#18737) — deux portes, une seule file : l'annonce que la socket sert
 * (canal `socket`) et la notification `device_unreachable` reçue onglet OUVERT (canal `push`), que la pastille dit
 * À LA PLACE de la bannière. La pastille ne range rien.
 */

const T0 = 1_700_000_000_000;
const ADA = 'b'.repeat(24);

const record = (overrides: Partial<NotificationRecord> = {}): NotificationRecord => ({
  id: 'n1',
  type: 'device_unreachable',
  title: 'Téléphone injoignable',
  content: 'Le téléphone de Ada est injoignable depuis 14:10',
  actor: { id: ADA, username: 'ada', displayName: 'Ada', avatar: null },
  context: {},
  metadata: { reachabilityKind: 'unreachable' },
  state: { isRead: false, createdAt: '2026-11-15T14:10:00.000Z' },
  ...overrides,
});

describe('la teinte d’une annonce', () => {
  test('l’injoignable alerte, le retour rassure', () => {
    expect(phoneReachabilityPillTone('unreachable')).toBe('alert');
    expect(phoneReachabilityPillTone('reachable')).toBe('good');
  });
});

describe('les annonces d’une même personne se remplacent', () => {
  test('la pastille dit le dernier pas, un téléphone barré puis entier', () => {
    const store = createPillAnnouncementStore();
    announcePhoneReachabilityOnPill({ store, userId: ADA, text: 'Le téléphone de Ada est injoignable depuis 14:10', kind: 'unreachable', now: T0 });
    expect(store.getState().queue[0]?.icon).toEqual({ kind: 'phone', reachable: false });
    announcePhoneReachabilityOnPill({ store, userId: ADA, text: 'Le téléphone de Ada répond de nouveau', kind: 'reachable', now: T0 + 1 });
    expect(store.getState().queue.map((entry) => entry.text)).toEqual(['Le téléphone de Ada répond de nouveau']);
    expect(store.getState().queue[0]).toMatchObject({ key: `phone:${ADA}`, tone: 'good', icon: { kind: 'phone', reachable: true } });
  });

  test('ne remplace pas l’annonce de batterie de la même personne : deux sources, deux clés', () => {
    const store = createPillAnnouncementStore();
    store.getState().announce({ id: 'b1', key: `battery:${ADA}`, text: 'Ada : batterie critique', tone: 'alert', icon: { kind: 'battery', level: 2, charging: false }, at: T0 });
    announcePhoneReachabilityOnPill({ store, userId: ADA, text: 'Le téléphone de Ada est injoignable depuis 14:10', kind: 'unreachable', now: T0 + 1 });
    expect(store.getState().queue).toHaveLength(2);
  });
});

describe('la notification reçue onglet ouvert', () => {
  test('devient une annonce de la pastille, au texte composé par le serveur', () => {
    const store = createPillAnnouncementStore();
    expect(announcePhoneReachabilityNotification(record(), { store, now: T0 })).toBe(true);
    expect(store.getState().queue[0]).toMatchObject({ key: `phone:${ADA}`, text: 'Téléphone injoignable · Le téléphone de Ada est injoignable depuis 14:10', tone: 'alert' });
  });

  test('le retour se dit en teinte rassurante', () => {
    const store = createPillAnnouncementStore();
    announcePhoneReachabilityNotification(record({ metadata: { reachabilityKind: 'reachable' }, title: null, content: 'Le téléphone de Ada répond de nouveau' }), { store, now: T0 });
    expect(store.getState().queue[0]).toMatchObject({ text: 'Le téléphone de Ada répond de nouveau', tone: 'good' });
  });

  test('une notification déjà lue, ou d’un autre type, ne dit rien', () => {
    const store = createPillAnnouncementStore();
    expect(announcePhoneReachabilityNotification(record({ state: { isRead: true, createdAt: '2026-11-15T14:10:00.000Z' } }), { store, now: T0 })).toBe(false);
    expect(announcePhoneReachabilityNotification(record({ type: 'device_battery' }), { store, now: T0 })).toBe(false);
    expect(store.getState().queue).toEqual([]);
  });

  test('le décodeur des notifications garde le pas servi par la passerelle', () => {
    const decoded = decodeNotification({
      id: 'n1',
      type: 'device_unreachable',
      title: 'Téléphone injoignable',
      content: 'x',
      metadata: { action: 'view_profile', userId: ADA, reachabilityKind: 'reachable', cause: 'battery' },
      state: { isRead: false, createdAt: '2026-11-15T14:10:00.000Z' },
    });
    expect(decoded?.metadata.reachabilityKind).toBe('reachable');
  });
});
