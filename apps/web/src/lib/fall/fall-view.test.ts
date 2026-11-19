import { beforeAll, describe, expect, test } from 'bun:test';

import type { FallState } from '@meeshy/shared/types/fall-detection';

import { loadFallCatalog } from '@/lib/i18n-fall-catalog';

import { fallAnnouncementText, fallDetailOf } from './fall-view';

/**
 * CE QUE LA CHUTE DÉTECTÉE DIT (#18748) — « Chute détectée à 16:42 » à l'horloge du LECTEUR (l'instant servi est déjà
 * tronqué à la minute), la dernière batterie et la dernière position SEULEMENT quand elles sont servies, et la phrase
 * de la pastille. Le fuseau est épinglé : le témoin ne dépend pas du poste.
 */

const PARIS = { timeZone: 'Europe/Paris' } as const;
const NOW = Date.parse('2026-11-19T15:50:00.000Z');

const state = (overrides: Partial<FallState> = {}): FallState => ({
  userId: 'b'.repeat(24),
  detectedAt: '2026-11-19T15:42:00.000Z',
  expiresAt: '2026-11-19T21:42:00.000Z',
  ...overrides,
});

beforeAll(async () => {
  await loadFallCatalog('fr');
  await loadFallCatalog('en');
});

describe('le détail', () => {
  test('sans batterie ni position servies : l’heure seule, à l’horloge du lecteur', () => {
    expect(fallDetailOf(state(), 'fr', { now: NOW, ...PARIS })).toEqual({ headline: 'Chute détectée à 16:42', battery: null, position: null });
  });

  test('la dernière batterie, en pourcentage de la langue du lecteur', () => {
    const served = state({ lastBattery: { level: 41, measuredAt: '2026-11-19T15:30:00.000Z' } });
    expect(fallDetailOf(served, 'fr', { now: NOW, ...PARIS }).battery?.replace(/\s/g, ' ')).toBe('Dernière batterie : 41 %');
    expect(fallDetailOf(served, 'en', { now: NOW, ...PARIS }).battery).toBe('Last battery: 41%');
  });

  test('la dernière position : de quoi ouvrir la carte, rien de plus', () => {
    const detail = fallDetailOf(state({ lastPosition: { latitude: 48.8566, longitude: 2.3522, accuracy: 30, recordedAt: '2026-11-19T15:40:00.000Z' } }), 'fr', { now: NOW, ...PARIS });
    expect(detail.position).toEqual({ latitude: 48.8566, longitude: 2.3522, label: 'Dernière position' });
  });
});

describe('l’annonce de la pastille', () => {
  test('la chute nomme la personne et sa montre', () => {
    expect(fallAnnouncementText('fr', { name: 'Awa', kind: 'detected' })).toBe('Une chute a été détectée sur la montre de Awa');
    expect(fallAnnouncementText('en', { name: 'Awa', kind: 'detected' })).toBe('A fall was detected on Awa’s watch');
  });

  test('le retour : « va bien »', () => {
    expect(fallAnnouncementText('fr', { name: 'Awa', kind: 'responded' })).toBe('Awa va bien');
  });

  test('sans nom connu, la phrase reste vraie sans nommer', () => {
    expect(fallAnnouncementText('fr', { name: null, kind: 'detected' })).toBe('Une chute a été détectée sur la montre d’un Sang');
    expect(fallAnnouncementText('fr', { name: null, kind: 'responded' })).toBe('Un Sang va bien');
  });
});
