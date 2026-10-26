/**
 * #13100 — Redis injoignable ne suspend pas le scellement de la passerelle
 * sans limite : le verrou se replie sur celui du processus, et le dit.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { resilientSealLock } from '../atRest/sealLock';

const down = {
  set: async () => { throw new Error('Connection is closed.'); },
  eval: async () => { throw new Error('Connection is closed.'); },
};

describe('le verrou de scellement de la passerelle', () => {
  it('Redis en panne : repli sur le verrou du processus, signalé, exclusif, relâchable', async () => {
    const signalled: unknown[] = [];
    const lock = resilientSealLock(() => down as never, (error) => signalled.push(error));
    const first = await lock('2026/10/u/a.jpg');
    expect(first).not.toBe('busy');
    expect(await lock('2026/10/u/a.jpg')).toBe('busy');
    expect(signalled.length).toBe(2);
    await (first as { release: () => Promise<void> }).release();
    expect(await lock('2026/10/u/a.jpg')).not.toBe('busy');
  });

  it('sans Redis du tout : le verrou du processus', async () => {
    const lock = resilientSealLock(() => null, () => undefined);
    const held = await lock('2026/10/u/b.jpg');
    expect(held).not.toBe('busy');
    expect(await lock('2026/10/u/b.jpg')).toBe('busy');
  });
});
