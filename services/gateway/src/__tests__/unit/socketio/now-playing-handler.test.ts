/**
 * La porte socket de l'écoute partagée (#13934, #16686) : un invité n'a pas de cercle,
 * le débit est borné, et l'effacement retire l'état rangé.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { listenNowPlaying, type NowPlayingHandlerDeps } from '../../../socketio/handlers/NowPlayingHandler';
import { messagingWorld, table } from '../../helpers/messaging-circle-world';

const MOI = '6300000000000000000000a1';

function porte(options: { readonly isAnonymous?: boolean; readonly within?: boolean | null } = {}) {
  const entries = new Map<string, string>();
  const world = messagingWorld({ users: [{ id: MOI }] });
  const deps: NowPlayingHandlerDeps = {
    relay: {
      prisma: { ...world.prisma, relationFeatureSetting: table([]) } as unknown as PrismaClient,
      cache: {
        get: async (key) => entries.get(key) ?? null,
        set: async (key, value) => { entries.set(key, value); },
        del: async (key) => { entries.delete(key); },
      },
      io: undefined,
      now: () => Date.parse('2026-11-07T12:00:00.000Z'),
    },
    callerOf: () => ({ userId: MOI, isAnonymous: options.isAnonymous ?? false }),
    withinRate: async () => (options.within === undefined ? true : options.within),
  };
  const handlers = new Map<string, (...args: unknown[]) => void>();
  listenNowPlaying({ id: 'sock', on: (event, listener) => { handlers.set(event, listener); } }, deps);
  const call = (event: string, payload: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => handlers.get(event)!(payload, resolve));
  return { entries, call };
}

describe('NowPlayingHandler — la porte', () => {
  it('un invité (participant anonyme) est refusé et rien n\'est rangé', async () => {
    const p = porte({ isAnonymous: true });
    expect(await p.call('now-playing:update', { category: 'music' })).toMatchObject({ success: false });
    expect(p.entries.size).toBe(0);
  });

  it('un compte inscrit publie : l\'état est rangé et l\'accusé rend son échéance', async () => {
    const p = porte();
    expect(await p.call('now-playing:update', { category: 'video', title: 'Un film' })).toEqual({
      success: true,
      data: { expiresAt: '2026-11-07T12:15:00.000Z' },
    });
    expect(p.entries.size).toBe(1);
  });

  it('au-delà du débit : NOW_PLAYING_RATE_LIMITED, rien n\'est rangé', async () => {
    const p = porte({ within: false });
    expect(await p.call('now-playing:update', { category: 'music' })).toMatchObject({ success: false, code: 'NOW_PLAYING_RATE_LIMITED' });
    expect(p.entries.size).toBe(0);
  });

  it('effacer retire l\'état rangé', async () => {
    const p = porte();
    await p.call('now-playing:update', { category: 'music' });
    expect(await p.call('now-playing:clear', {})).toEqual({ success: true });
    expect(p.entries.size).toBe(0);
  });
});
