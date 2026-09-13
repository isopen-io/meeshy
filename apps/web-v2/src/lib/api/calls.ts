import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DU JOURNAL D'APPELS** (#6362) — miroir `CallHistoryService` (iOS).
 * Squelette : aucune logique, les témoins de `calls.test.ts` rougissent.
 */

export const CALL_HISTORY_PAGE_SIZE = 30;

export type CallDirection = 'incoming' | 'outgoing' | 'missed';
export type CallHistoryFilter = 'all' | 'missed';

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
  readonly peer: CallPeer | null;
};

export type CallHistoryPage = { readonly records: readonly CallRecord[]; readonly nextCursor: string | null };

export type CallsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const callHistoryQueryKey = (filter: CallHistoryFilter) => ['calls', 'history', filter] as const;

export function decodeCallRecord(_raw: unknown): CallRecord | null {
  return null;
}

export async function loadCallHistory(
  _params: CallsDeps & { readonly filter: CallHistoryFilter; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<CallHistoryPage>> {
  return { ok: false, status: 0, error: 'non implémenté' };
}
