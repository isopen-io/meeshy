import { describe, expect, test } from 'bun:test';

import { createLottieBytesCache } from './bytes-cache';

/**
 * LE MÊME CONTOUR SUR TRENTE RANGÉES SE CHARGE UNE FOIS (#10815) — les octets
 * d'une couche (téléchargés, empreinte vérifiée) sont partagés par clé, dans
 * un cache borné ; un échec n'est pas retenu.
 */
const bytes = new Uint8Array([1, 2, 3]);

const counting = (result: Uint8Array | null) => {
  const calls = { count: 0 };
  return { calls, load: async () => ((calls.count += 1), result) };
};

describe('le cache des octets Lottie', () => {
  test('deux couches de même clé partagent un seul chargement', async () => {
    const cached = createLottieBytesCache(4);
    const source = counting(bytes);
    const [first, second] = await Promise.all([cached('a', source.load)(), cached('a', source.load)()]);
    expect(first).toBe(bytes);
    expect(second).toBe(bytes);
    expect(source.calls.count).toBe(1);
  });

  test('un échec n’est pas retenu : la couche suivante réessaie', async () => {
    const cached = createLottieBytesCache(4);
    const source = counting(null);
    expect(await cached('a', source.load)()).toBeNull();
    expect(await cached('a', source.load)()).toBeNull();
    expect(source.calls.count).toBe(2);
  });

  test('le cache est borné : la clé la moins récemment servie part la première', async () => {
    const cached = createLottieBytesCache(2);
    const a = counting(bytes);
    const b = counting(bytes);
    const c = counting(bytes);
    await cached('a', a.load)();
    await cached('b', b.load)();
    await cached('a', a.load)();
    await cached('c', c.load)();
    await cached('a', a.load)();
    await cached('b', b.load)();
    expect(a.calls.count).toBe(1);
    expect(b.calls.count).toBe(2);
  });
});
