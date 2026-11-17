import { beforeAll, describe, expect, test } from 'bun:test';

import type { BatteryReaderState } from '@meeshy/shared/types/battery';

import { loadBatteryCatalog } from '@/lib/i18n-battery-catalog';

import { batteryAnnouncementText, batteryBadgeOf, batteryDetailOf, batteryDurationText, batteryToneOf } from './battery-view';

/**
 * CE QUE LA BATTERIE DIT, ET COMMENT (#14147) — lois pures : la teinte, la phrase de la pastille, le détail de la
 * fiche. Le serveur a décidé la phase ; ce module ne rejuge rien, il NOMME.
 */

const T0 = Date.parse('2026-11-15T10:00:00.000Z');

/** `Intl` pose une espace insécable entre le nombre et l'unité : le témoin compare le TEXTE, pas l'espace. */
const plain = (text: string): string => text.replace(/\s/g, ' ');

const state = (overrides: Partial<BatteryReaderState> = {}): BatteryReaderState => ({
  userId: 'b'.repeat(24),
  phase: 'low',
  level: 22,
  charging: false,
  lowPower: false,
  measuredAt: '2026-11-15T10:00:00.000Z',
  ...overrides,
});

beforeAll(async () => {
  await loadBatteryCatalog('fr');
  await loadBatteryCatalog('en');
});

describe('la teinte suit la phase servie', () => {
  test('faible, critique, éteint, en charge', () => {
    expect(batteryToneOf(state())).toBe('low');
    expect(batteryToneOf(state({ phase: 'critical', level: 4 }))).toBe('critical');
    expect(batteryToneOf(state({ phase: 'off', level: 2 }))).toBe('off');
    expect(batteryToneOf(state({ phase: 'charging', charging: true }))).toBe('charging');
  });

  test('un branchement pendant un épisode faible se peint en charge', () => {
    expect(batteryToneOf(state({ charging: true }))).toBe('charging');
  });
});

describe('la phrase de la pastille', () => {
  test('nomme la personne et le niveau de l’annonce', () => {
    expect(batteryAnnouncementText('fr', { name: 'Ada', announcement: { kind: 'critical', level: 4, at: '2026-11-15T10:00:00.000Z' } })).toBe('Ada : batterie critique (4 %)');
    expect(batteryAnnouncementText('fr', { name: 'Ada', announcement: { kind: 'threshold', level: 19, threshold: 20, at: '2026-11-15T10:00:00.000Z' } })).toBe('Ada : batterie à 20 %');
  });

  test('sans niveau connu, la phrase tient sans chiffre', () => {
    expect(batteryAnnouncementText('fr', { name: 'Ada', announcement: { kind: 'low', level: null, at: '2026-11-15T10:00:00.000Z' } })).toBe('Ada : batterie faible');
    expect(batteryAnnouncementText('fr', { name: 'Ada', announcement: { kind: 'probably-off', level: null, at: '2026-11-15T10:00:00.000Z' } })).toBe('Ada : téléphone probablement éteint');
  });

  test('sans nom connu, « un proche »', () => {
    expect(batteryAnnouncementText('en', { name: null, announcement: { kind: 'recharged', level: 100, at: '2026-11-15T10:00:00.000Z' } })).toBe('Someone close: phone recharged');
  });
});

describe('l’icône de l’avatar', () => {
  test('dit le niveau au lecteur d’écran, et la charge', () => {
    expect(batteryBadgeOf(state(), 'fr')).toEqual({ tone: 'low', level: 22, charging: false, spoken: 'batterie à 22 %' });
    expect(batteryBadgeOf(state({ charging: true, phase: 'charging' }), 'fr').spoken).toBe('batterie à 22 %, en charge');
    expect(batteryBadgeOf(state({ phase: 'off', level: 1 }), 'fr').spoken).toBe('téléphone probablement éteint');
  });
});

describe('le détail de la fiche', () => {
  test('niveau, charge, mode économie, autonomie et âge du relevé', () => {
    const detail = batteryDetailOf(state({ lowPower: true, estimatedMinutes: 95, deviceLabel: 'iPhone', measuredAt: '2026-11-15T09:48:00.000Z' }), 'fr', T0);
    expect(detail.headline).toBe('Batterie faible');
    expect(detail.level).toBe('22 %');
    expect(detail.lines.map(plain)).toEqual(['Mode économie d’énergie activé', 'Environ 1 h 35 min d’autonomie', 'Relevé il y a 12 minutes', 'Sur iPhone']);
  });

  test('un téléphone présumé éteint dit son DERNIER niveau, sans autonomie', () => {
    const detail = batteryDetailOf(state({ phase: 'off', level: 2, estimatedMinutes: 10, measuredAt: '2026-11-15T09:59:40.000Z' }), 'fr', T0);
    expect(detail.headline).toBe('Téléphone probablement éteint');
    expect(detail.level).toBe('Dernier niveau connu : 2 %');
    expect(detail.lines).toEqual(['Relevé à l’instant']);
  });

  test('en charge : aucune autonomie annoncée', () => {
    const detail = batteryDetailOf(state({ phase: 'charging', charging: true, estimatedMinutes: 30 }), 'fr', T0);
    expect(detail.lines).toEqual(['En charge', 'Relevé à l’instant']);
  });
});

describe('les durées', () => {
  test('minutes seules, heures et minutes, heures rondes', () => {
    expect(plain(batteryDurationText('fr', 45))).toBe('45 min');
    expect(plain(batteryDurationText('fr', 95))).toBe('1 h 35 min');
    expect(plain(batteryDurationText('fr', 120))).toBe('2 h');
  });
});
