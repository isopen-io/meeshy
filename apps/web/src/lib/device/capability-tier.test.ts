import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { classifyDeviceTier, deviceTierOf, type DeviceHost, type DeviceTier, type DeviceTierInputs } from './capability-tier';

/**
 * LE TIER DE CAPACITE (W10, #11316) - jumeau de `DeviceMediaTier.classify` (iOS).
 * Les deux rejouent le MEME fichier de vecteurs : la loi ne peut pas diverger
 * d'un cote sans qu'un temoin rougisse.
 */
type Vector = { readonly name: string; readonly input: DeviceTierInputs; readonly tier: DeviceTier };

const FILE = fileURLToPath(new URL('../../../../../packages/shared/fixtures/device-tier-vectors.json', import.meta.url));
const vectors = (JSON.parse(readFileSync(FILE, 'utf8')) as { readonly vectors: readonly Vector[] }).vectors;

describe('classifyDeviceTier - les vecteurs partages avec iOS', () => {
  test('le fichier est lu et couvre les quatre tiers', () => {
    expect(vectors.length).toBeGreaterThanOrEqual(20);
    expect(new Set(vectors.map((v) => v.tier))).toEqual(new Set(['low', 'mid', 'high', 'pro']));
  });

  for (const vector of vectors) {
    test(`${vector.name} -> ${vector.tier}`, () => {
      expect(classifyDeviceTier(vector.input)).toBe(vector.tier);
    });
  }
});

const host = (overrides: Partial<DeviceHost> = {}): DeviceHost => ({ ...overrides });

describe('deviceTierOf - ce que le navigateur declare', () => {
  test('un navigateur muet (Safari, worker sans signal) ne baisse rien : high', () => {
    expect(deviceTierOf(host())).toBe('high');
    expect(deviceTierOf(host({ navigator: {} }))).toBe('high');
  });

  test('la WebView Android d\'entree de gamme (2 Go) est low', () => {
    expect(deviceTierOf(host({ navigator: { deviceMemory: 2, hardwareConcurrency: 8 } }))).toBe('low');
  });

  test('4 Go et 8 coeurs : high ; 4 Go et 2 coeurs : mid', () => {
    expect(deviceTierOf(host({ navigator: { deviceMemory: 4, hardwareConcurrency: 8 } }))).toBe('high');
    expect(deviceTierOf(host({ navigator: { deviceMemory: 4, hardwareConcurrency: 2 } }))).toBe('mid');
  });

  test('pro exige une cadence 120 Hz ET l\'AV1 materiel MESURES : le navigateur seul ne les declare pas', () => {
    const rich = { deviceMemory: 8, hardwareConcurrency: 8 };
    expect(deviceTierOf(host({ navigator: rich }))).toBe('high');
    expect(deviceTierOf(host({ navigator: rich, maxFps: 120, hwAV1: true }))).toBe('pro');
  });

  test('un coeur inconnu ou nul n\'est pas une mesure', () => {
    expect(deviceTierOf(host({ navigator: { deviceMemory: 8, hardwareConcurrency: 0 } }))).toBe('high');
  });

  test('la batterie faible (debranchee, 20 % ou moins) plafonne a mid ; branchee, rien', () => {
    const navigator = { deviceMemory: 8, hardwareConcurrency: 8 };
    expect(deviceTierOf(host({ navigator, battery: { level: 0.15, charging: false } }))).toBe('mid');
    expect(deviceTierOf(host({ navigator, battery: { level: 0.15, charging: true } }))).toBe('high');
  });

  test('saveData et prefers-reduced-data plafonnent a mid', () => {
    const navigator = { deviceMemory: 8, hardwareConcurrency: 8 };
    expect(deviceTierOf(host({ navigator: { ...navigator, connection: { saveData: true } } }))).toBe('mid');
    expect(deviceTierOf(host({ navigator, prefersReducedData: true }))).toBe('mid');
  });

  test('un reseau 2G rend low, un 3G plafonne a mid, un 4G ne change rien', () => {
    const navigator = { deviceMemory: 8, hardwareConcurrency: 8 };
    expect(deviceTierOf(host({ navigator: { ...navigator, connection: { effectiveType: 'slow-2g' } } }))).toBe('low');
    expect(deviceTierOf(host({ navigator: { ...navigator, connection: { effectiveType: '2g' } } }))).toBe('low');
    expect(deviceTierOf(host({ navigator: { ...navigator, connection: { effectiveType: '3g' } } }))).toBe('mid');
    expect(deviceTierOf(host({ navigator: { ...navigator, connection: { effectiveType: '4g' } } }))).toBe('high');
  });

  test('une contrainte ne releve jamais un appareil bas', () => {
    expect(deviceTierOf(host({ navigator: { deviceMemory: 1, connection: { saveData: true } } }))).toBe('low');
  });
});
