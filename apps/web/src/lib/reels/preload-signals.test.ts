import { describe, expect, test } from 'bun:test';

import { lowPowerOf, preloadSignalsOf } from './preload-signals';

describe('preloadSignalsOf — un signal absent ne plafonne rien', () => {
  test('un navigateur muet (Safari) rend un réseau vide', () => {
    expect(preloadSignalsOf({ navigator: {} })).toEqual({ network: {}, tier: 'high' });
    expect(preloadSignalsOf({ navigator: undefined })).toEqual({ network: {}, tier: 'high' });
  });

  test('la WebView Android dit son réseau et sa mémoire', () => {
    const signals = preloadSignalsOf({ navigator: { connection: { effectiveType: '3g', saveData: true }, deviceMemory: 2 } });
    expect(signals).toEqual({ network: { effectiveType: '3g', saveData: true }, deviceMemoryGb: 2, tier: 'low' });
  });

  test('un type de réseau inconnu est ignoré', () => {
    expect(preloadSignalsOf({ navigator: { connection: { effectiveType: '5g' } } }).network).toEqual({});
  });
});

describe('lowPowerOf — la batterie faible ne compte que débranchée', () => {
  test('sous 20 % et sur batterie', () => {
    expect(lowPowerOf({ level: 0.15, charging: false })).toBe(true);
    expect(lowPowerOf({ level: 0.15, charging: true })).toBe(false);
    expect(lowPowerOf({ level: 0.5, charging: false })).toBe(false);
    expect(lowPowerOf(undefined)).toBeUndefined();
  });
});

describe('preloadSignalsOf - le tier est celui de la loi unique (W10)', () => {
  test('la batterie faible et le reseau 3G plafonnent le tier a mid', () => {
    const navigator = { deviceMemory: 8, hardwareConcurrency: 8, connection: { effectiveType: '3g' } };
    expect(preloadSignalsOf({ navigator }).tier).toBe('mid');
    expect(preloadSignalsOf({ navigator: { deviceMemory: 8, hardwareConcurrency: 8 }, battery: { level: 0.1, charging: false } }).tier).toBe('mid');
  });
});
