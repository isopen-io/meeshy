import { describe, expect, test } from 'bun:test';

import { lowPowerOf, preloadSignalsOf } from './preload-signals';

describe('preloadSignalsOf — un signal absent ne plafonne rien', () => {
  test('un navigateur muet (Safari) rend un réseau vide', () => {
    expect(preloadSignalsOf({ navigator: {} })).toEqual({ network: {} });
    expect(preloadSignalsOf({ navigator: undefined })).toEqual({ network: {} });
  });

  test('la WebView Android dit son réseau et sa mémoire', () => {
    const signals = preloadSignalsOf({ navigator: { connection: { effectiveType: '3g', saveData: true }, deviceMemory: 2 } });
    expect(signals).toEqual({ network: { effectiveType: '3g', saveData: true }, deviceMemoryGb: 2 });
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
