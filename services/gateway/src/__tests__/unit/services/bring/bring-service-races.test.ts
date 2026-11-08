/**
 * #14441 — les témoins adversariaux de l'audit du Bring, repris au lot : le compteur
 * injoignable ferme (M7), un blocage acquitté pendant l'envoi empêche la sonnerie (M2),
 * une écriture d'état qui échoue rend le décompte (m7).
 *
 * @jest-environment node
 */
import { describe, it, expect, jest } from '@jest/globals';
import { sendBring, stopBringsOnBlock, type BringDeps } from '../../../../services/bring/bringService';
import { AUTRE, MOI, NOW, lien } from '../../../helpers/relation-app';

const user = (id: string) => ({
  id, isActive: true, deletedAt: null, deactivatedAt: null, timezone: null, birthDate: null, displayName: 'X', username: 'x', avatar: null,
  systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
});

const memCache = () => {
  const m = new Map<string, string>();
  return {
    store: m,
    get: async (k: string) => m.get(k) ?? null,
    set: async (k: string, v: string) => { m.set(k, v); },
    setnx: async (k: string, v: string) => { if (m.has(k)) return false; m.set(k, v); return true; },
    del: async (k: string) => { m.delete(k); },
  };
};

function depsWith(over: Partial<BringDeps> & { readonly blocked: { at: Date | null } }) {
  const emits: string[] = [];
  const released: string[] = [];
  const cache = memCache();
  const deps: BringDeps = {
    prisma: {
      user: { findUnique: async (a: { where: { id: string } }) => user(a.where.id), findFirst: async () => null },
      userRelation: { findUnique: async () => lien('CLOSE', 'CLOSE') },
      friendRequest: { findFirst: async () => null, findMany: async () => [] },
      relationFeatureSetting: { findUnique: async () => ({ bringBlockedAt: over.blocked.at }) },
      userPreferences: { findUnique: async () => null },
    } as never,
    cache,
    quota: {
      consume: async () => ({ remaining: 2, exceeded: false }),
      release: async (_perDay, key) => { released.push(key); },
    },
    thresholds: { bring: { perDay: { FRIEND: 1, CLOSE: 3, BLOOD: 30, ATOM: null } } } as never,
    io: { to: (room: string) => ({ emit: (ev: string) => { emits.push(`${room}:${ev}`); } }) } as never,
    push: { sendToUser: async () => [] } as never,
    now: () => new Date(NOW),
    criticalAlerts: false,
    enabled: true,
    report: () => undefined,
    ...over,
  };
  return { deps, emits, released, cache };
}

describe('#14441 — le Bring sous concurrence et en panne', () => {
  it('M7 : un compteur injoignable FERME — BRING_UNAVAILABLE, aucun son, la paire est libérée', async () => {
    const { deps, emits, cache } = depsWith({ blocked: { at: null }, quota: { consume: async () => null, release: async () => undefined } });
    const out = await sendBring(deps, MOI, AUTRE);

    expect(out).toMatchObject({ ok: false, code: 'BRING_UNAVAILABLE', status: 503 });
    expect(emits).toEqual([]);
    expect(cache.store.size).toBe(0);
  });

  it('M2 : un blocage du Bring acquitté PENDANT l’envoi empêche la sonnerie, et le décompte est rendu', async () => {
    const blocked = { at: null as Date | null };
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { deps, emits, released } = depsWith({
      blocked,
      quota: { consume: async () => { await gate; return { remaining: 2, exceeded: false }; }, release: async (_p, key) => { released.push(key); } },
    });
    const sending = sendBring(deps, MOI, AUTRE);
    await new Promise((r) => setImmediate(r));
    blocked.at = new Date(NOW);
    await stopBringsOnBlock(deps, { blockerId: AUTRE, blockedId: MOI, scope: 'bring' });
    release();
    const out = await sending;

    expect(emits.filter((e) => e.endsWith('bring:ring'))).toEqual([]);
    expect(out).toMatchObject({ ok: false });
    expect(released).toHaveLength(1);
  });

  it('m7 : l’écriture de l’état échoue après le décompte ⇒ décompte rendu, paire libérée, aucun son', async () => {
    const { deps, emits, released, cache } = depsWith({ blocked: { at: null } });
    const failing = { ...cache, set: jest.fn(async () => { throw new Error('redis'); }) };
    await expect(sendBring({ ...deps, cache: failing }, MOI, AUTRE)).rejects.toThrow('redis');

    expect(released).toHaveLength(1);
    expect(cache.store.size).toBe(0);
    expect(emits).toEqual([]);
  });
});
