import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { CallHistoryData } from '@/lib/calls/view';

import { callHistoryQueryKey, type CallRecord } from './calls';
import { performClearCallHistory, performHideCall } from './call-history-actions';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * EFFACER DU JOURNAL (#8066) — miroir de `CallHistoryService.hide` / `clearAll`
 * d'iOS. La ligne quitte les DEUX filtres AVANT la réponse, et revient si la
 * passerelle refuse : instantané → application locale → réseau → retour arrière.
 */

const record = (callId: string, direction: CallRecord['direction']): CallRecord => ({
  callId,
  conversationId: `conv-${callId}`,
  conversationType: 'direct',
  conversationTitle: null,
  conversationAvatar: null,
  direction,
  isVideo: false,
  startedAt: '2026-09-20T09:00:00.000Z',
  durationSec: 0,
  bytes: null,
  peer: null,
});

const data = (records: readonly CallRecord[], nextCursor: string | null = null): CallHistoryData => ({
  pages: [{ records, nextCursor }],
  pageParams: [null],
});

const seeded = (): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(callHistoryQueryKey('all'), data([record('c1', 'missed'), record('c2', 'incoming'), record('c3', 'missed')], 'next'));
  queryClient.setQueryData(callHistoryQueryKey('missed'), data([record('c1', 'missed'), record('c3', 'missed')]));
  return queryClient;
};

const ids = (queryClient: QueryClient, filter: 'all' | 'missed') =>
  queryClient.getQueryData<CallHistoryData>(callHistoryQueryKey(filter))?.pages.flatMap((page) => page.records.map((r) => r.callId));

const suspended = () => {
  let release: (result: ApiResult<unknown>) => void = () => undefined;
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    },
  } as unknown as HttpTransport;
  return { transport, requests, release: (result: ApiResult<unknown>) => release(result) };
};

describe('effacer UN appel du journal', () => {
  test('la ligne quitte « Tous » et « Manqués » AVANT la réponse, par `DELETE /calls/history/:callId`', async () => {
    const queryClient = seeded();
    const { transport, requests, release } = suspended();

    const pending = performHideCall({ callId: 'c1', deps: { source: 'gateway', transport, queryClient } });

    expect(ids(queryClient, 'all')).toEqual(['c2', 'c3']);
    expect(ids(queryClient, 'missed')).toEqual(['c3']);
    expect(requests[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/calls/history/c1' });

    release({ ok: true, data: { callId: 'c1', hidden: true } });
    expect(await pending).toBe(true);
    expect(ids(queryClient, 'all')).toEqual(['c2', 'c3']);
  });

  test('un refus RÉTABLIT la ligne à sa place dans les deux filtres', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();

    const pending = performHideCall({ callId: 'c1', deps: { source: 'gateway', transport, queryClient } });
    release({ ok: false, status: 500, error: 'boom' });

    expect(await pending).toBe(false);
    expect(ids(queryClient, 'all')).toEqual(['c1', 'c2', 'c3']);
    expect(ids(queryClient, 'missed')).toEqual(['c1', 'c3']);
  });

  test('un 404 est un succès : l’appel n’est déjà plus dans le journal du lecteur', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();

    const pending = performHideCall({ callId: 'c1', deps: { source: 'gateway', transport, queryClient } });
    release({ ok: false, status: 404, error: 'CALL_NOT_FOUND' });

    expect(await pending).toBe(true);
    expect(ids(queryClient, 'all')).toEqual(['c2', 'c3']);
  });

  test('l’identifiant est encodé dans le chemin', async () => {
    const { transport, requests, release } = suspended();
    const pending = performHideCall({ callId: 'a/b', deps: { source: 'gateway', transport, queryClient: new QueryClient() } });
    release({ ok: true, data: null });
    await pending;
    expect(requests[0]?.path).toBe('/api/v1/calls/history/a%2Fb');
  });
});

describe('vider tout le journal', () => {
  test('les deux filtres se vident AVANT la réponse, sans curseur de page suivante ; `DELETE /calls/history`', async () => {
    const queryClient = seeded();
    const { transport, requests, release } = suspended();

    const pending = performClearCallHistory({ deps: { source: 'gateway', transport, queryClient } });

    expect(ids(queryClient, 'all')).toEqual([]);
    expect(ids(queryClient, 'missed')).toEqual([]);
    expect(queryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('all'))?.pages.at(-1)?.nextCursor).toBeNull();
    expect(requests[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/calls/history' });

    release({ ok: true, data: { cleared: 3 } });
    expect(await pending).toBe(true);
  });

  test('un refus rend le journal ENTIER, pages et curseur compris', async () => {
    const queryClient = seeded();
    const { transport, release } = suspended();

    const pending = performClearCallHistory({ deps: { source: 'gateway', transport, queryClient } });
    release({ ok: false, status: 0, error: 'offline' });

    expect(await pending).toBe(false);
    expect(ids(queryClient, 'all')).toEqual(['c1', 'c2', 'c3']);
    expect(queryClient.getQueryData<CallHistoryData>(callHistoryQueryKey('all'))?.pages.at(-1)?.nextCursor).toBe('next');
  });
});
