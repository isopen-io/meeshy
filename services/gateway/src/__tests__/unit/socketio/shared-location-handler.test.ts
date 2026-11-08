/**
 * La porte socket du partage temporaire de position (#16980) : un invité n'a pas de
 * cercle, le débit est borné, et arrêter retire le partage rangé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { listenSharedLocation, localSharedLocationRate, type SharedLocationHandlerDeps } from '../../../socketio/handlers/SharedLocationHandler';
import { messagingWorld } from '../../helpers/messaging-circle-world';

const MOI = '6300000000000000000000a1';
const AMI = '6300000000000000000000a2';
const DEMARRER = { recipients: [{ userId: AMI }], durationMinutes: 60, position: { latitude: 48.85, longitude: 2.35 } };

const etats = (p: { readonly entries: Map<string, string> }): string[] => [...p.entries.keys()].filter((key) => key.startsWith(`shared-location:${MOI}`));

function porte(options: { readonly isAnonymous?: boolean; readonly within?: boolean } = {}) {
  const entries = new Map<string, string>();
  const world = messagingWorld({ users: [{ id: MOI }, { id: AMI }], links: [[MOI, AMI, 'FRIEND']] });
  const deps: SharedLocationHandlerDeps = {
    relay: {
      prisma: world.prisma as unknown as PrismaClient,
      cache: {
        get: async (key) => entries.get(key) ?? null,
        set: async (key, value) => { entries.set(key, value); },
        del: async (key) => { entries.delete(key); },
      },
      io: undefined,
      now: () => Date.parse('2026-11-08T12:00:00.000Z'),
    },
    callerOf: () => ({ userId: MOI, isAnonymous: options.isAnonymous ?? false }),
    withinRate: async () => (options.within === undefined ? true : options.within),
  };
  const handlers = new Map<string, (...args: unknown[]) => void>();
  listenSharedLocation({ id: 'sock', on: (event, listener) => { handlers.set(event, listener); } }, deps);
  const call = (event: string, payload: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => handlers.get(event)!(payload, resolve));
  return { entries, call };
}

describe('SharedLocationHandler — la porte', () => {
  it('un invité (participant anonyme) est refusé et rien n\'est rangé', async () => {
    const p = porte({ isAnonymous: true });
    expect(await p.call('location:share-start', DEMARRER)).toMatchObject({ success: false });
    expect(p.entries.size).toBe(0);
  });

  it('un compte inscrit démarre : le partage est rangé et l\'accusé rend son terme', async () => {
    const p = porte();
    expect(await p.call('location:share-start', DEMARRER)).toEqual({ success: true, data: { expiresAt: '2026-11-08T13:00:00.000Z' } });
    expect([...p.entries.keys()].map((key) => key.replace(/[0-9a-f-]{36}$/, '<session>')).sort()).toEqual(['shared-location-current:' + MOI, 'shared-location:' + MOI + ':<session>'].sort());
    expect(await p.call('location:share-update', { latitude: 48.86, longitude: 2.34 })).toMatchObject({ success: true });
  });

  it('au-delà du débit : SHARED_LOCATION_RATE_LIMITED, rien n\'est rangé', async () => {
    const p = porte({ within: false });
    expect(await p.call('location:share-start', DEMARRER)).toMatchObject({ success: false, code: 'SHARED_LOCATION_RATE_LIMITED' });
    expect(p.entries.size).toBe(0);
  });

  it('arrêter n\'est jamais limité : au-delà du débit, on peut encore arrêter', async () => {
    const p = porte();
    await p.call('location:share-start', DEMARRER);
    const limitee = porte({ within: false });
    p.entries.forEach((value, key) => limitee.entries.set(key, value));
    expect(etats(limitee)).toHaveLength(1);
    expect(await limitee.call('location:share-stop', {})).toEqual({ success: true });
    expect(etats(limitee)).toEqual([]);
  });

  it('arrêter retire le partage rangé', async () => {
    const p = porte();
    await p.call('location:share-start', DEMARRER);
    expect(etats(p)).toHaveLength(1);
    expect(await p.call('location:share-stop', {})).toEqual({ success: true });
    expect(etats(p)).toEqual([]);
  });
});

describe('le repli du débit — un limiteur partagé muet ne laisse pas passer sans borne', () => {
  it('au-delà du débit, le compteur local refuse ; une nouvelle fenêtre rouvre ; chaque compte a la sienne', () => {
    const local = localSharedLocationRate({ max: 2, windowMs: 1_000 });
    expect([local(MOI, 0), local(MOI, 10), local(MOI, 20)]).toEqual([true, true, false]);
    expect(local(AMI, 20)).toBe(true);
    expect(local(MOI, 1_000)).toBe(true);
  });
});
