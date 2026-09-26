import type { QueryClient } from '@tanstack/react-query';

import type { CallHistoryData } from '@/lib/calls/view';

import { CALLS_QUERY_PREFIX, type CallRecord, type CallsDeps } from './calls';
import type { ApiResult } from './http';

/**
 * **EFFACER DU JOURNAL D'APPELS** (#8066) — miroir de la suppression par
 * balayage et de « Tout effacer » de `CallsTab.swift`. Effacer ne supprime pas
 * l'appel : la passerelle le retire du SEUL journal du lecteur
 * (`CallSession.hiddenForUserIds`, `services/gateway/src/services/calls/
 * callHistoryList.ts`) ; l'autre participant garde le sien.
 *
 * Optimiste (CLAUDE.md § Optimistic Updates) : la ligne quitte les deux filtres
 * au geste, et l'instantané revient si la passerelle refuse. Un 404 sur une
 * ligne est un SUCCÈS : l'appel n'est déjà plus dans ce journal.
 */

export type CallHistoryActionDeps = CallsDeps & { readonly queryClient: QueryClient };

const HISTORY_QUERY_KEY = [...CALLS_QUERY_PREFIX, 'history'] as const;

type HistorySnapshot = ReadonlyArray<readonly [readonly unknown[], CallHistoryData | undefined]>;

const snapshotHistory = (queryClient: QueryClient): HistorySnapshot =>
  queryClient.getQueriesData<CallHistoryData>({ queryKey: HISTORY_QUERY_KEY });

const restoreHistory = (queryClient: QueryClient, snapshot: HistorySnapshot): void => {
  for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
};

const updateHistory = (queryClient: QueryClient, update: (data: CallHistoryData) => CallHistoryData): void => {
  queryClient.setQueriesData<CallHistoryData>({ queryKey: HISTORY_QUERY_KEY }, (data) => (data === undefined ? data : update(data)));
};

const withoutRecords = (data: CallHistoryData, drops: (record: CallRecord) => boolean): CallHistoryData => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, records: page.records.filter((record) => !drops(record)) })),
});

const EMPTY_HISTORY: CallHistoryData = { pages: [{ records: [], nextCursor: null }], pageParams: [null] };

async function deleteFromHistory(deps: CallsDeps, path: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: null };
  return deps.transport.request<unknown>({ method: 'DELETE', path });
}

async function applyOptimistically(params: {
  readonly deps: CallHistoryActionDeps;
  readonly apply: (data: CallHistoryData) => CallHistoryData;
  readonly send: () => Promise<ApiResult<unknown>>;
  readonly settled: (result: ApiResult<unknown>) => boolean;
}): Promise<boolean> {
  const { deps, apply, send, settled } = params;
  void deps.queryClient.cancelQueries({ queryKey: HISTORY_QUERY_KEY }).catch(() => undefined);
  const snapshot = snapshotHistory(deps.queryClient);
  updateHistory(deps.queryClient, apply);
  const done = settled(await send());
  if (!done) restoreHistory(deps.queryClient, snapshot);
  return done;
}

export function performHideCall(params: { readonly callId: string; readonly deps: CallHistoryActionDeps }): Promise<boolean> {
  const { callId, deps } = params;
  return applyOptimistically({
    deps,
    apply: (data) => withoutRecords(data, (record) => record.callId === callId),
    send: () => deleteFromHistory(deps, `/api/v1/calls/history/${encodeURIComponent(callId)}`),
    settled: (result) => result.ok || result.status === 404,
  });
}

export function performClearCallHistory(params: { readonly deps: CallHistoryActionDeps }): Promise<boolean> {
  const { deps } = params;
  return applyOptimistically({
    deps,
    apply: () => EMPTY_HISTORY,
    send: () => deleteFromHistory(deps, '/api/v1/calls/history'),
    settled: (result) => result.ok,
  });
}
