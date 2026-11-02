import { describe, expect, test } from 'bun:test';

import { browserCanRunEndToEnd, createEngineReadiness } from './engine-readiness';

const capable = { WebAssembly: { instantiate: () => undefined }, indexedDB: {}, crypto: { subtle: {} }, isSecureContext: true };

describe('le navigateur sait-il porter libsignal ? (fail-closed, #14592)', () => {
  test('WebAssembly, IndexedDB, WebCrypto et un contexte sûr : oui', () => {
    expect(browserCanRunEndToEnd(capable)).toBe(true);
  });

  for (const [missing, env] of [
    ['WebAssembly', { ...capable, WebAssembly: undefined }],
    ['IndexedDB', { ...capable, indexedDB: undefined }],
    ['WebCrypto', { ...capable, crypto: {} }],
    ['un contexte sûr', { ...capable, isSecureContext: false }],
  ] as const) {
    test(`sans ${missing} : non`, () => {
      expect(browserCanRunEndToEnd(env)).toBe(false);
    });
  }
});

describe('le moteur n\'est prêt qu\'une fois chargé, et un échec le laisse fermé', () => {
  test('avant tout chargement : pas prêt, et rien ne se charge tant qu\'on ne le demande pas', () => {
    let loads = 0;
    const readiness = createEngineReadiness({ capable: () => true, load: async () => { loads += 1; } });
    expect(readiness.store.getState()).toBe('unknown');
    expect(loads).toBe(0);
  });

  test('un chargement réussi rend prêt, une seule fois', async () => {
    let loads = 0;
    const readiness = createEngineReadiness({ capable: () => true, load: async () => { loads += 1; } });
    await Promise.all([readiness.ensure(), readiness.ensure()]);
    expect(readiness.store.getState()).toBe('ready');
    expect(loads).toBe(1);
  });

  test('un chargement en échec laisse fermé', async () => {
    const readiness = createEngineReadiness({ capable: () => true, load: async () => { throw new Error('wasm refusé'); } });
    await readiness.ensure();
    expect(readiness.store.getState()).toBe('failed');
  });

  test('un navigateur incapable ne charge rien et reste fermé', async () => {
    let loads = 0;
    const readiness = createEngineReadiness({ capable: () => false, load: async () => { loads += 1; } });
    await readiness.ensure();
    expect(readiness.store.getState()).toBe('failed');
    expect(loads).toBe(0);
  });
});
