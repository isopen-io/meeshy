/**
 * La porte socket du partage temporaire de position (#16980) : un invité n'a pas de
 * cercle, le débit est borné, et arrêter retire le partage rangé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { listenSharedLocation, localSharedLocationRate, sharedLocationWithinRate, type SharedLocationHandlerDeps } from '../../../socketio/handlers/SharedLocationHandler';
import { messagingWorld } from '../../helpers/messaging-circle-world';
import { sharedLocationKvEnMemoire } from '../../helpers/shared-location-kv';

const MOI = '6300000000000000000000a1';
const AMI = '6300000000000000000000a2';
const DEMARRER = { recipients: [{ userId: AMI }], durationMinutes: 60, position: { latitude: 48.85, longitude: 2.35 } };


function porte(options: { readonly isAnonymous?: boolean; readonly within?: boolean } = {}) {
  const cache = sharedLocationKvEnMemoire();
  const world = messagingWorld({ users: [{ id: MOI }, { id: AMI }], links: [[MOI, AMI, 'FRIEND']] });
  const deps: SharedLocationHandlerDeps = {
    relay: {
      prisma: world.prisma as unknown as PrismaClient,
      cache,
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
  return { cache, entries: cache.entries, etats: () => cache.etatsDe(MOI), call };
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
    expect(p.cache.clesDe(MOI).map((key) => key.replace(/[0-9a-f-]{36}$/, '<session>')).sort()).toEqual([`shared-location-current:{${MOI}}`, `shared-location:{${MOI}}:<session>`].sort());
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
    expect(limitee.etats()).toHaveLength(1);
    expect(await limitee.call('location:share-stop', {})).toEqual({ success: true });
    expect(limitee.etats()).toEqual([]);
  });

  it('arrêter retire le partage rangé', async () => {
    const p = porte();
    await p.call('location:share-start', DEMARRER);
    expect(p.etats()).toHaveLength(1);
    expect(await p.call('location:share-stop', {})).toEqual({ success: true });
    expect(p.etats()).toEqual([]);
  });
});

describe('le repli du débit — un limiteur partagé muet ne laisse pas passer sans borne', () => {
  it('au-delà du débit, le compteur local refuse ; une nouvelle fenêtre rouvre ; chaque compte a la sienne', () => {
    const local = localSharedLocationRate({ max: 2, windowMs: 1_000 });
    expect([local(MOI, 0), local(MOI, 10), local(MOI, 20)]).toEqual([true, true, false]);
    expect(local(AMI, 20)).toBe(true);
    expect(local(MOI, 1_000)).toBe(true);
  });

  it('les fenêtres échues s\'élaguent par la tête : un compte revenu après sa fenêtre repart de zéro', () => {
    const local = localSharedLocationRate({ max: 1, windowMs: 1_000 });
    expect([local(MOI, 0), local(AMI, 500), local(MOI, 1_000), local(AMI, 1_000), local(AMI, 1_500)]).toEqual([true, true, true, false, true]);
  });
});

describe('le juge du débit — désactivé par configuration, en panne, ou dans les clous', () => {
  const juge = (options: { readonly disabled: boolean; readonly info: { readonly retryAfter?: number } | null }) => {
    const consumed: string[] = [];
    const within = sharedLocationWithinRate({
      consume: async (userId) => {
        consumed.push(userId);
        return options.info === null ? null : { limit: 120, remaining: 0, reset: 0, ...options.info };
      },
      disabled: () => options.disabled,
      local: localSharedLocationRate({ max: 1, windowMs: 60_000 }),
      now: () => 0,
    });
    return { within, consumed };
  };

  it('limitation coupée par configuration : tout passe, ni le limiteur ni le compteur local ne jugent', async () => {
    const { within, consumed } = juge({ disabled: true, info: null });
    expect([await within(MOI), await within(MOI), await within(MOI)]).toEqual([true, true, true]);
    expect(consumed).toEqual([]);
  });

  it('magasin du limiteur en panne : le compteur local juge', async () => {
    const { within } = juge({ disabled: false, info: null });
    expect([await within(MOI), await within(MOI)]).toEqual([true, false]);
  });

  it('le limiteur partagé juge quand il répond', async () => {
    expect(await juge({ disabled: false, info: {} }).within(MOI)).toBe(true);
    expect(await juge({ disabled: false, info: { retryAfter: 30 } }).within(MOI)).toBe(false);
  });
});
