import { parseCallReactionCounts, type CallReactionCounts } from '@meeshy/shared/types/call-control-law';
import type { QueryClient } from '@tanstack/react-query';
import * as z from 'zod/mini';
import * as callsEndpoints from '@meeshy/shared/api/endpoints/calls';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU JOURNAL D'APPELS** (#6362) — miroir `CallHistoryService` et
 * `APICallRecord` (iOS, `packages/MeeshySDK/Sources/MeeshySDK/Models/
 * CallModels.swift`).
 *
 * `GET calls.history?limit=&filter=all|missed&cursor=` — les appels
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
 * servi par AUCUNE surface web (D-129, #6383 : la fiche d'un appel ne le montre
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

/** Qui a rejoint un appel de GROUPE (#8066) — un nom et un visage, jamais une présence ni un contact. */
export type CallParticipantName = {
  readonly participantId: string;
  readonly username: string | null;
  readonly displayName: string;
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
  /** Les participants d'un appel de groupe, lecteur exclu ; vide pour un appel direct. */
  readonly participants: readonly CallParticipantName[];
  /** Les réactions envoyées pendant l'appel (#8439), relues sans confiance. */
  readonly reactionCounts: CallReactionCounts;
};

export type CallHistoryPage = { readonly records: readonly CallRecord[]; readonly nextCursor: string | null };

export type CallsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const CALLS_QUERY_PREFIX = ['calls'] as const;

export const CALL_HISTORY_TYPES = ['all', 'audio', 'video'] as const;
export type CallHistoryType = (typeof CALL_HISTORY_TYPES)[number];

/**
 * LE JOURNAL RAFFINÉ (#8203) — type d'appel et recherche par nom, appliqués
 * par la passerelle en une requête. Un raffinement vide EST le journal entier :
 * même requête, même clé de cache (persistée, effaçable, lue par la fiche).
 */
export type CallHistoryRefine = { readonly type: CallHistoryType; readonly q: string };

const refineOf = (refine: CallHistoryRefine | undefined): CallHistoryRefine | null => {
  const q = refine?.q.trim() ?? '';
  const type = refine?.type ?? 'all';
  return type === 'all' && q === '' ? null : { type, q };
};

export const callHistoryQueryKey = (filter: CallHistoryFilter, refine?: CallHistoryRefine) => {
  const refined = refineOf(refine);
  return refined === null ? (['calls', 'history', filter] as const) : (['calls', 'history', filter, refined] as const);
};

const optionalText = z.optional(z.nullable(z.string()));

const WirePeer = z.object({
  userId: z.string().check(z.minLength(1)),
  username: z.string(),
  displayName: optionalText,
  avatar: optionalText,
});

const WireParticipant = z.object({
  participantId: z.string().check(z.minLength(1)),
  username: optionalText,
  displayName: z.string().check(z.minLength(1)),
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
  participants: z.optional(z.unknown()),
  reactionCounts: z.optional(z.unknown()),
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

function decodeParticipants(raw: unknown): readonly CallParticipantName[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = WireParticipant.safeParse(entry);
    if (!parsed.success) return [];
    const { participantId, username, displayName, avatar } = parsed.data;
    return [{ participantId, username: textOrNull(username), displayName, avatar: textOrNull(avatar) }];
  });
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
    participants: decodeParticipants(wire.participants),
    reactionCounts: parseCallReactionCounts(wire.reactionCounts),
  };
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()), nextCursor: optionalText });

const nextCursorOf = (pagination: unknown): string | null => {
  const parsed = WirePagination.safeParse(pagination);
  return parsed.success && parsed.data.hasMore === true ? textOrNull(parsed.data.nextCursor) : null;
};

const historyPath = (filter: CallHistoryFilter, cursor: string | null, refine: CallHistoryRefine | undefined): string => {
  const query = new URLSearchParams({ limit: String(CALL_HISTORY_PAGE_SIZE), filter });
  const refined = refineOf(refine);
  if (refined !== null && refined.type !== 'all') query.set('type', refined.type);
  if (refined !== null && refined.q !== '') query.set('q', refined.q);
  if (cursor !== null) query.set('cursor', cursor);
  return `${callsEndpoints.history}?${query.toString()}`;
};

export async function loadCallHistory(
  params: CallsDeps & {
    readonly filter: CallHistoryFilter;
    readonly cursor: string | null;
    readonly refine?: CallHistoryRefine;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<CallHistoryPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCallHistory } = await import('./fixtures-calls');
    return { ok: true, data: fixtureCallHistory(params.filter, refineOf(params.refine)) };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: historyPath(params.filter, params.cursor, params.refine),
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

/** Une recherche ne se garde pas : sa clé quitte le cache (et la persistance) une minute après qu'on l'a quittée. */
const REFINED_GC_MS = 60_000;

export function callHistoryQueryOptions(deps: CallsDeps, filter: CallHistoryFilter, refine?: CallHistoryRefine) {
  return {
    queryKey: callHistoryQueryKey(filter, refine),
    ...(refineOf(refine) === null ? {} : { gcTime: REFINED_GC_MS }),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(
        await loadCallHistory({
          ...deps,
          filter,
          cursor: pageParam,
          ...(refine === undefined ? {} : { refine }),
          ...(signal === undefined ? {} : { signal }),
        }),
      ),
    getNextPageParam: (page: CallHistoryPage) => page.nextCursor ?? undefined,
  };
}

/** Tirer pour rafraîchir : la PREMIÈRE page seule, refaite — jamais les pages déjà défilées rejouées une à une. */
export function refreshCallHistory(
  queryClient: QueryClient,
  deps: CallsDeps,
  filter: CallHistoryFilter,
  refine?: CallHistoryRefine,
): Promise<void> {
  return queryClient.fetchInfiniteQuery({ ...callHistoryQueryOptions(deps, filter, refine), pages: 1, staleTime: 0 }).then(() => undefined);
}
