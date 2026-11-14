import { describe, expect, test } from 'bun:test';

import type { BannerRecallReason } from '@meeshy/shared/utils/game/banner-recall';

import { watchBannerRecall } from './use-banner-recall';

/**
 * LE GUET DU RAPPEL (#17366, retouche 3) — le bloc `game` en cache change (un `game:updated`, une relecture) : ce qui
 * vient de naître rappelle le bandeau. Aucune requête ne part pour lui.
 */
const block = (done: number, extra: { readonly chest?: 'locked' | 'ready' | 'claimed'; readonly flame?: 'lit' | 'at-risk' } = {}) => ({
  game: {
    missions: { unlocked: true, items: [0, 1, 2].map((index) => ({ completedAt: index < done ? '2026-11-14T09:00:00.000Z' : null })) },
    chest: { status: extra.chest ?? 'locked' },
    flame: { status: extra.flame ?? 'lit', days: 4 },
  },
});

const fakeCache = (initial: unknown) => {
  let data = initial;
  const listeners = new Set<() => void>();
  return {
    read: () => data,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    write: (next: unknown) => {
      data = next;
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
};

describe('watchBannerRecall', () => {
  test('un acte réalisé dans le cache rappelle le bandeau, une fois', () => {
    const cache = fakeCache(block(1));
    const seen: BannerRecallReason[] = [];
    const stop = watchBannerRecall({ ...cache, hidden: () => false, onRecall: (reason) => seen.push(reason) });
    cache.write(block(2));
    cache.write(block(2));
    expect(seen).toEqual(['act']);
    stop();
    expect(cache.listeners.size).toBe(0);
  });

  test('l’Offrande prête puis la Flamme à risque rappellent chacune', () => {
    const cache = fakeCache(block(2));
    const seen: BannerRecallReason[] = [];
    watchBannerRecall({ ...cache, hidden: () => false, onRecall: (reason) => seen.push(reason) });
    cache.write(block(3, { chest: 'ready' }));
    cache.write(block(3, { chest: 'ready', flame: 'at-risk' }));
    expect(seen).toEqual(['offering-ready', 'flame-at-risk']);
  });

  test('le premier bloc arrivé dans un cache vide ne rappelle rien', () => {
    const cache = fakeCache(undefined);
    const seen: BannerRecallReason[] = [];
    watchBannerRecall({ ...cache, hidden: () => false, onRecall: (reason) => seen.push(reason) });
    cache.write(block(2, { chest: 'ready' }));
    expect(seen).toEqual([]);
  });

  test('« Jeu masqué » : rien ne rappelle', () => {
    const cache = fakeCache(block(0));
    const seen: BannerRecallReason[] = [];
    watchBannerRecall({ ...cache, hidden: () => true, onRecall: (reason) => seen.push(reason) });
    cache.write(block(1));
    expect(seen).toEqual([]);
  });

  test('le bloc d’un ancien serveur, sans actes ni Offrande, ne fait rien tomber', () => {
    const cache = fakeCache({ game: { flame: { status: 'lit', days: 2 } } });
    const seen: BannerRecallReason[] = [];
    watchBannerRecall({ ...cache, hidden: () => false, onRecall: (reason) => seen.push(reason) });
    cache.write({ game: { missions: { unlocked: true } } });
    expect(seen).toEqual([]);
  });
});
