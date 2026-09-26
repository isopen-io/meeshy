import type { QueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU JOURNAL D'APPELS** (#6362) — miroir `CallHistoryService` et
 * `APICallRecord` (iOS, `packages/MeeshySDK/Sources/MeeshySDK/Models/
 * CallModels.swift`).
 *
 * `GET /api/v1/calls/history?limit=&filter=all|missed&cursor=` — les appels
 * TERMINÉS des conversations du lecteur sur trois mois glissants, du plus
 * récent au plus ancien (`services/gateway/src/routes/calls-consultation.ts`,
 * `CallService.listHistory`). La DIRECTION est dérivée par la passerelle
 * (`callHistory.ts › deriveCallDirection`) : le client la croit, et une valeur
 * inconnue se lit « reçu », comme `CallDirection(raw:)`.
 *
 * **Un appel décodé est une PROJECTION.** La charge porte le numéro de
 * téléphone du pair et sa présence ; le cache de requêtes est persisté
 * (`query-client.ts`) et ni l'un ni l'autre n'y entre — la présence d'autrui
 * n'entre jamais dans un cache persisté (D-60), et le numéro du pair n'est
 * servi par AUCUNE surface web (D-127, #6383 : la fiche d'un appel ne le montre
 * pas). Les OCTETS échangés, eux, entrent depuis #6383 : ils décrivent l'appel
 * du lecteur, pas le pair, et la fiche de détail les montre (« Données »).
 */

export const CALL_HISTORY_PAGE_SIZE = 30;

export const CALL_HISTORY_FILTERS = ['all', 'missed'] as const;
export type CallHistoryFilter = (typeof CALL_HISTORY_FILTERS)[number];

const CALL_DIRECTIONS = ['incoming', 'outgoing', 'missed'] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export type CallPeer = {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type CallRecord = {
  readonly callId: string;
  readonly conversationId: string;
  readonly conversationType: string;
  readonly conversationTitle: string | null;
  readonly conversationAvatar: string | null;
  readonly direction: CallDirection;
  readonly isVideo: boolean;
  readonly startedAt: string;
  readonly durationSec: number;
  /** Octets envoyés + reçus par le lecteur, `null` quand aucun client ne les a rapportés. */
  readonly bytes: number | null;
  readonly peer: CallPeer | null;
};

export type CallHistoryPage = { readonly records: readonly CallRecord[]; readonly nextCursor: string | null };

export type CallsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const CALLS_QUERY_PREFIX = ['calls'] as const;
export const callHistoryQueryKey = (filter: CallHistoryFilter) => ['calls', 'history', filter] as const;

const optionalText = z.optional(z.nullable(z.string()));

const WirePeer = z.object({
  userId: z.string().check(z.minLength(1)),
  username: z.string(),
  displayName: optionalText,
  avatar: optionalText,
});

const WireRecord = z.object({
  callId: z.string().check(z.minLength(1)),
  conversationId: z.string().check(z.minLength(1)),
  conversationType: optionalText,
  conversationTitle: optionalText,
  conversationAvatar: optionalText,
  direction: optionalText,
  isVideo: z.optional(z.nullable(z.boolean())),
  startedAt: z.string().check(z.refine((value) => Number.isFinite(Date.parse(value)))),
  durationSec: z.optional(z.nullable(z.number())),
  bytesSent: z.optional(z.nullable(z.number())),
  bytesReceived: z.optional(z.nullable(z.number())),
  peer: z.optional(z.unknown()),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const directionOf = (raw: string | null | undefined): CallDirection => CALL_DIRECTIONS.find((direction) => direction === raw) ?? 'incoming';

const positiveIntOf = (raw: number | null | undefined): number =>
  typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

const secondsOf = positiveIntOf;

/** `dataLabel` d'iOS : la somme des deux sens, `null` si aucun n'est rapporté ou si elle est nulle. */
const bytesOf = (sent: number | null | undefined, received: number | null | undefined): number | null => {
  const total = positiveIntOf(sent) + positiveIntOf(received);
  return total > 0 ? total : null;
};

function decodePeer(raw: unknown): CallPeer | null {
  const parsed = WirePeer.safeParse(raw);
  if (!parsed.success) return null;
  const { userId, username, displayName, avatar } = parsed.data;
  return { userId, username, displayName: textOrNull(displayName), avatar: textOrNull(avatar) };
}

export function decodeCallRecord(raw: unknown): CallRecord | null {
  const parsed = WireRecord.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    callId: wire.callId,
    conversationId: wire.conversationId,
    conversationType: textOrNull(wire.conversationType) ?? 'direct',
    conversationTitle: textOrNull(wire.conversationTitle),
    conversationAvatar: textOrNull(wire.conversationAvatar),
    direction: directionOf(wire.direction),
    isVideo: wire.isVideo === true,
    startedAt: new Date(wire.startedAt).toISOString(),
    durationSec: secondsOf(wire.durationSec),
    bytes: bytesOf(wire.bytesSent, wire.bytesReceived),
    peer: decodePeer(wire.peer),
  };
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()), nextCursor: optionalText });

const nextCursorOf = (pagination: unknown): string | null => {
  const parsed = WirePagination.safeParse(pagination);
  return parsed.success && parsed.data.hasMore === true ? textOrNull(parsed.data.nextCursor) : null;
};

const historyPath = (filter: CallHistoryFilter, cursor: string | null): string => {
  const query = new URLSearchParams({ limit: String(CALL_HISTORY_PAGE_SIZE), filter });
  if (cursor !== null) query.set('cursor', cursor);
  return `/api/v1/calls/history?${query.toString()}`;
};

export async function loadCallHistory(
  params: CallsDeps & { readonly filter: CallHistoryFilter; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<CallHistoryPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCallHistory } = await import('./fixtures-calls');
    return { ok: true, data: fixtureCallHistory(params.filter) };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: historyPath(params.filter, params.cursor),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const records = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const record = decodeCallRecord(raw);
    return record === null ? [] : [record];
  });
  return { ok: true, data: { records, nextCursor: nextCursorOf(result.pagination) } };
}

type PageContext = { readonly pageParam: string | null; readonly signal?: AbortSignal };

export function callHistoryQueryOptions(deps: CallsDeps, filter: CallHistoryFilter) {
  return {
    queryKey: callHistoryQueryKey(filter),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadCallHistory({ ...deps, filter, cursor: pageParam, ...(signal === undefined ? {} : { signal }) })),
    getNextPageParam: (page: CallHistoryPage) => page.nextCursor ?? undefined,
  };
}

/** Tirer pour rafraîchir : la PREMIÈRE page seule, refaite — jamais les pages déjà défilées rejouées une à une. */
export function refreshCallHistory(queryClient: QueryClient, deps: CallsDeps, filter: CallHistoryFilter): Promise<void> {
  return queryClient.fetchInfiniteQuery({ ...callHistoryQueryOptions(deps, filter), pages: 1, staleTime: 0 }).then(() => undefined);
}
