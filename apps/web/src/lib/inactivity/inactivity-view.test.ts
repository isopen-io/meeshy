import { beforeAll, describe, expect, test } from 'bun:test';

import type { InactivityAlertState } from '@meeshy/shared/types/inactivity-check';

import { loadInactivityCatalog } from '@/lib/i18n-inactivity-catalog';

import { inactivityAnnouncementText, inactivityDetailOf, inactivityDelayLabel } from './inactivity-view';

/**
 * CE QUE LA VÉRIFICATION D'INACTIVITÉ DIT (#18738) — « Aucune activité depuis 8:00 » à l'horloge du LECTEUR, la
 * dernière batterie et la dernière position SEULEMENT quand elles sont servies, la phrase de la pastille et le
 * libellé d'un délai. Le fuseau est épinglé : le témoin ne dépend pas du poste.
 */

const PARIS = { timeZone: 'Europe/Paris' } as const;
const NOW = Date.parse('2026-11-18T20:35:00.000Z');

const state = (overrides: Partial<InactivityAlertState> = {}): InactivityAlertState => ({
  userId: 'b'.repeat(24),
  inactiveSince: '2026-11-18T07:00:00.000Z',
  alertedAt: '2026-11-18T20:30:00.000Z',
  ...overrides,
});

beforeAll(async () => {
  await loadInactivityCatalog('fr');
  await loadInactivityCatalog('en');
});

describe('le détail', () => {
  test('sans batterie ni position servies : l’heure seule, à l’horloge du lecteur', () => {
    expect(inactivityDetailOf(state(), 'fr', { now: NOW, ...PARIS })).toEqual({ headline: 'Aucune activité depuis 08:00', battery: null, position: null });
  });

  test('la dernière batterie, en pourcentage de la langue du lecteur', () => {
    const detail = inactivityDetailOf(state({ lastBattery: { level: 9, measuredAt: '2026-11-18T06:58:00.000Z' } }), 'fr', { now: NOW, ...PARIS });
    expect(detail.battery?.replace(/\s/g, ' ')).toBe('Dernière batterie : 9 %');
    expect(inactivityDetailOf(state({ lastBattery: { level: 9, measuredAt: '2026-11-18T06:58:00.000Z' } }), 'en', { now: NOW, ...PARIS }).battery).toBe('Last battery: 9%');
  });

  test('la dernière position : de quoi ouvrir la carte, rien de plus', () => {
    const detail = inactivityDetailOf(state({ lastPosition: { latitude: 48.8566, longitude: 2.3522, accuracy: 30, recordedAt: '2026-11-18T06:55:00.000Z' } }), 'fr', { now: NOW, ...PARIS });
    expect(detail.position).toEqual({ latitude: 48.8566, longitude: 2.3522, label: 'Dernière position' });
  });

  test('un autre jour : le jour en plus', () => {
    expect(inactivityDetailOf(state({ inactiveSince: '2026-11-17T21:05:00.000Z' }), 'fr', { now: NOW, ...PARIS }).headline).toBe('Aucune activité depuis mardi 22:05');
  });
});

describe('l’annonce de la pastille', () => {
  const announcement = { kind: 'alert', inactiveSince: '2026-11-18T07:00:00.000Z', at: '2026-11-18T20:30:00.000Z' } as const;

  test('l’alerte nomme la personne et la question restée sans réponse', () => {
    expect(inactivityAnnouncementText('fr', { name: 'Jacques', announcement })).toBe('Jacques n’a pas répondu à « Tout va bien ? »');
    expect(inactivityAnnouncementText('en', { name: 'Jacques', announcement })).toBe('Jacques didn’t answer “Are you OK?”');
  });

  test('le retour : « va bien »', () => {
    expect(inactivityAnnouncementText('fr', { name: 'Jacques', announcement: { ...announcement, kind: 'responded' } })).toBe('Jacques va bien');
  });

  test('sans nom connu, la phrase reste vraie sans nommer', () => {
    expect(inactivityAnnouncementText('fr', { name: null, announcement })).toBe('Un Sang n’a pas répondu à « Tout va bien ? »');
    expect(inactivityAnnouncementText('fr', { name: null, announcement: { ...announcement, kind: 'responded' } })).toBe('Un Sang va bien');
  });
});

describe('le délai', () => {
  test('6 h, 12 h, 24 h ou « Désactivée »', () => {
    expect([6, 12, 24, null].map((delay) => inactivityDelayLabel('fr', delay as 6 | 12 | 24 | null))).toEqual(['6 h', '12 h', '24 h', 'Désactivée']);
  });
});
