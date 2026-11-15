import { beforeAll, describe, expect, test } from 'bun:test';

import type { PhoneReachabilityState } from '@meeshy/shared/types/phone-reachability';

import { loadPhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';

import { phoneReachabilityAnnouncementText, phoneReachabilityDetailOf, phoneSinceText, phoneUnreachableBadgeOf } from './phone-reachability-view';

/**
 * CE QUE LE TÉLÉPHONE INJOIGNABLE DIT (#18737) — l'heure « depuis » à l'horloge du LECTEUR (le jour en plus quand
 * ce n'est pas aujourd'hui), la phrase de la pastille, le glyphe et le détail. Le fuseau est épinglé : le témoin ne
 * dépend pas du poste.
 */

const PARIS = { timeZone: 'Europe/Paris' } as const;
const NOW = Date.parse('2026-11-15T15:00:00.000Z');

const state = (overrides: Partial<PhoneReachabilityState> = {}): PhoneReachabilityState => ({
  userId: 'b'.repeat(24),
  unreachableSince: '2026-11-15T13:10:00.000Z',
  cause: 'battery',
  ...overrides,
});

beforeAll(async () => {
  await loadPhoneReachabilityCatalog('fr');
  await loadPhoneReachabilityCatalog('en');
});

describe('l’heure « depuis »', () => {
  test('aujourd’hui : l’heure locale du lecteur, seule', () => {
    expect(phoneSinceText('fr', '2026-11-15T13:10:00.000Z', { now: NOW, ...PARIS })).toBe('14:10');
    expect(phoneSinceText('fr', '2026-11-15T13:10:00.000Z', { now: NOW, timeZone: 'America/New_York' })).toBe('08:10');
  });

  test('un autre jour : le jour en plus', () => {
    expect(phoneSinceText('fr', '2026-11-14T21:05:00.000Z', { now: NOW, ...PARIS })).toBe('samedi 22:05');
  });
});

describe('la phrase de la pastille', () => {
  test('injoignable : le nom et l’heure', () => {
    const announcement = { kind: 'unreachable', at: '2026-11-15T14:59:00.000Z' } as const;
    expect(phoneReachabilityAnnouncementText('fr', { name: 'Ada', announcement, since: '2026-11-15T13:10:00.000Z', now: NOW, ...PARIS })).toBe('Le téléphone de Ada est injoignable depuis 14:10');
  });

  test('de nouveau joignable', () => {
    const announcement = { kind: 'reachable', at: '2026-11-15T14:59:00.000Z' } as const;
    expect(phoneReachabilityAnnouncementText('fr', { name: 'Ada', announcement, since: null, now: NOW, ...PARIS })).toBe('Le téléphone de Ada répond de nouveau');
  });

  test('sans nom connu, « un proche »', () => {
    const announcement = { kind: 'unreachable', at: '2026-11-15T13:10:00.000Z' } as const;
    expect(phoneReachabilityAnnouncementText('fr', { name: null, announcement, since: null, now: NOW, ...PARIS })).toBe('Le téléphone d’un proche est injoignable depuis 14:10');
    expect(phoneReachabilityAnnouncementText('en', { name: null, announcement: { kind: 'reachable', at: announcement.at }, since: null, now: NOW, ...PARIS })).toBe('A close one’s phone is responding again');
  });
});

describe('le glyphe de l’avatar', () => {
  test('se dit au lecteur d’écran avec l’heure', () => {
    expect(phoneUnreachableBadgeOf(state(), 'fr', { now: NOW, ...PARIS })).toEqual({ spoken: 'téléphone injoignable depuis 14:10' });
  });
});

describe('le détail de la fiche', () => {
  test('l’heure, puis la cause probable', () => {
    expect(phoneReachabilityDetailOf(state(), 'fr', { now: NOW, ...PARIS })).toEqual({ headline: 'Téléphone injoignable depuis 14:10', cause: 'Batterie vide, probablement' });
    expect(phoneReachabilityDetailOf(state({ cause: 'network' }), 'fr', { now: NOW, ...PARIS }).cause).toBe('Sans réseau ou en mode avion, probablement');
  });

  test('une cause inconnue ne se dit pas : l’heure reste', () => {
    expect(phoneReachabilityDetailOf(state({ cause: 'unknown' }), 'fr', { now: NOW, ...PARIS })).toEqual({ headline: 'Téléphone injoignable depuis 14:10', cause: null });
  });
});
