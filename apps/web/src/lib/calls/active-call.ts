import type { ConversationsDeps } from '@/lib/api/conversations';

/**
 * **L'APPEL EN COURS D'UNE CONVERSATION** (#6382) — `GET
 * /api/v1/conversations/:id/active-call` (`calls-consultation.ts:264`), la
 * même lecture qu'iOS (`ActiveCallService.swift`) pour « Rejoindre » : la
 * bulle d'un appel en cours et un `CALL_ALREADY_ACTIVE` au lancement. Rend
 * l'identifiant de l'appel, ou `null` quand il n'y en a plus.
 */
export async function fetchActiveCallId(deps: Pick<ConversationsDeps, 'source' | 'transport'>, conversationId: string): Promise<string | null> {
  if (deps.source === 'fixtures') return null;
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `/api/v1/conversations/${encodeURIComponent(conversationId)}/active-call` });
  if (!result.ok) return null;
  const data = result.data;
  if (typeof data !== 'object' || data === null) return null;
  const id = (data as { readonly id?: unknown }).id;
  const status = (data as { readonly status?: unknown }).status;
  if (typeof id !== 'string' || id === '') return null;
  return status === 'ended' || status === 'missed' || status === 'rejected' || status === 'failed' ? null : id;
}
