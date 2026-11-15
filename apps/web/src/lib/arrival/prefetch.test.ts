import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import { FEED_QUERY_KEY } from '@/lib/api/feed';
import { friendRequestsQueryKey } from '@/lib/api/friend-requests';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { STORY_TRAY_QUERY_KEY } from '@/lib/api/stories';

import { prefetchArrival } from './prefetch';

/**
 * LE PRÉCHARGEMENT DE L'ARRIVÉE (#8088) — pendant la célébration, les
 * premières données RÉELLES partent EN PARALLÈLE, par les MÊMES fabriques et
 * sous les MÊMES clés que les écrans qui les lisent (liste des conversations
 * et son plateau de stories, contacts, fil) : l'écran des conversations se
 * peint depuis le cache, sans squelette.
 */
function heldTransport() {
  const seen: HttpRequest[] = [];
  const releases: Array<(result: ApiResult<unknown>) => void> = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = ((request: HttpRequest) => {
    seen.push(request);
    return new Promise<ApiResult<unknown>>((resolve) => releases.push(resolve));
  }) as HttpTransport['request'];
  return { transport, seen, releaseAll: (result: ApiResult<unknown>) => releases.forEach((release) => release(result)) };
}

const flush = async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('prefetchArrival (#8088)', () => {
  test('les quatre lectures partent ENSEMBLE, avant qu’aucune ne réponde', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const held = heldTransport();
    void prefetchArrival(queryClient, { source: 'gateway', transport: held.transport });
    await flush();
    const paths = held.seen.map((r) => r.path);
    expect(paths.some((p) => p.startsWith('/api/v1/conversations?'))).toBe(true);
    expect(paths.some((p) => p.startsWith('/api/v1/directory/friend-requests'))).toBe(true);
    expect(paths.some((p) => p.includes('scope=home'))).toBe(true);
    expect(paths.some((p) => p.includes('scope=stories'))).toBe(true);
    expect(held.seen).toHaveLength(4);
  });

  test('les données arrivent sous les clés que les écrans lisent', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await prefetchArrival(queryClient, { source: 'fixtures', transport: heldTransport().transport });
    expect(queryClient.getQueryData(CONVERSATIONS_QUERY_KEY)).toBeDefined();
    expect(queryClient.getQueryData(FEED_QUERY_KEY)).toBeDefined();
    expect(queryClient.getQueryData(friendRequestsQueryKey('accepted'))).toBeDefined();
    expect(queryClient.getQueryData(STORY_TRAY_QUERY_KEY)).toBeDefined();
  });

  test('une lecture en échec ne fait jamais rejeter le préchargement', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const held = heldTransport();
    const done = prefetchArrival(queryClient, { source: 'gateway', transport: held.transport });
    await flush();
    held.releaseAll({ ok: false, status: 500, error: 'panne' });
    const outcome = await done.then(
      () => 'résolu',
      () => 'rejeté',
    );
    expect(outcome).toBe('résolu');
  });
});
