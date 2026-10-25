import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { GAME_PHOTO_ROUTES } from '@meeshy/shared/types/game-routes';
import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { gameBlockFixture } from '@/lib/api/game-fixture';
import type { SafeStorage } from '@/lib/storage';
import { pathOf, routedTransport } from '@/test-support/routed-transport';

import { createAppPhotoWrites } from './photo-writes';

/**
 * LES ÉCRITURES PHOTO DE L'APPLICATION (#10174) — telles que l'application les câble : une file par COMPTE,
 * gardée sur l'appareil, rejouée seule. Personne ici n'appelle la file à la main.
 */
const memoryStorage = (): SafeStorage => {
  const cells = new Map<string, string>();
  return {
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
    removeItem: (key) => {
      cells.delete(key);
    },
  };
};

const bench = (shared: { readonly storage: SafeStorage; readonly online: { value: boolean }; readonly viewer: { value: string } }) => {
  const client = new QueryClient();
  client.setQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY, { ...resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE), game: gameBlockFixture() });
  const routed = routedTransport((req) => (pathOf(req).startsWith('/api/v1/me/game/photo-moments/') ? { ok: true, data: { presented: [], kept: [], invitations: 'never' } } : undefined));
  const target = new EventTarget();
  let n = 0;
  const writes = createAppPhotoWrites({
    transport: routed.transport,
    client,
    storage: shared.storage,
    viewer: () => shared.viewer.value,
    isOnline: () => shared.online.value,
    requestId: () => `req-${(n += 1)}`,
    target,
    now: () => new Date('2026-10-25T12:00:00.000Z'),
  });
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const sent = () => routed.calls().map((c) => [pathOf(c), (c.body as { stepIds?: string[] }).stepIds ?? (c.body as { invitations?: string }).invitations]);
  return { writes, target, tick, sent };
};

describe('les écritures photo de l’application', () => {
  test('hors ligne, le signal attend sur l’appareil et part au retour du réseau', async () => {
    const shared = { storage: memoryStorage(), online: { value: false }, viewer: { value: 'u1' } };
    const b = bench(shared);
    b.writes.signalKept(['flame:7']);
    expect(b.sent()).toEqual([]);
    shared.online.value = true;
    b.target.dispatchEvent(new Event('online'));
    await b.tick();
    expect(b.sent()).toEqual([[`/api/v1${GAME_PHOTO_ROUTES.photoKept}`, ['flame:7']]]);
    b.writes.stop();
  });

  test('l’onglet fermé hors ligne : la séance suivante envoie ce qui attendait', async () => {
    const shared = { storage: memoryStorage(), online: { value: false }, viewer: { value: 'u1' } };
    const first = bench(shared);
    first.writes.setInvitations('never');
    first.writes.acknowledgePresented(['meesh:10']);
    first.writes.stop();
    shared.online.value = true;
    const next = bench(shared);
    await next.tick();
    await next.tick();
    expect(next.sent()).toEqual([
      [`/api/v1${GAME_PHOTO_ROUTES.photoInvitations}`, 'never'],
      [`/api/v1${GAME_PHOTO_ROUTES.photoPresented}`, ['meesh:10']],
    ]);
    next.writes.stop();
  });

  test('ce qu’un compte a mis en file ne part jamais sous un autre compte', async () => {
    const shared = { storage: memoryStorage(), online: { value: false }, viewer: { value: 'u1' } };
    const first = bench(shared);
    first.writes.signalKept(['flame:7']);
    first.writes.stop();
    shared.online.value = true;
    shared.viewer.value = 'u2';
    const other = bench(shared);
    await other.tick();
    expect(other.sent()).toEqual([]);
    shared.viewer.value = 'u1';
    other.target.dispatchEvent(new Event('online'));
    await other.tick();
    expect(other.sent()).toEqual([[`/api/v1${GAME_PHOTO_ROUTES.photoKept}`, ['flame:7']]]);
    other.writes.stop();
  });
});
