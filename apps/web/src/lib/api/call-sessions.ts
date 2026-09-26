import * as z from 'zod/mini';

import type { CallsDeps } from './calls';
import type { ApiResult } from './http';

/**
 * **LES SESSIONS D'APPEL** (lot 3 des appels) — trois lectures servies par
 * `services/gateway/src/routes/calls-consultation.ts` au MÊME schéma
 * (`callSessionSchema`, `packages/shared/types/api-schemas/call-session.ts`) :
 *
 * - `GET /api/v1/calls/active` — l'appel dont le lecteur est encore membre :
 *   la bannière « Reprendre l'appel » et la reprise après rechargement (#3586,
 *   E7), miroir `ActiveCallService` d'iOS. `404 NO_ACTIVE_CALL` est une
 *   RÉPONSE (« aucun »), jamais une panne ;
 * - `GET /api/v1/calls/:callId` — le lien profond `/call/:callId` (A12) ;
 *   introuvable et interdit se confondent volontairement : la fiche dit
 *   « appel introuvable » sans révéler qu'il existe ;
 * - `GET /api/v1/conversations/:id/active-call` — la pastille « Rejoindre » de
 *   l'en-tête du fil (H3), le sondage du legacy (`use-call-banner.ts`).
 *
 * **Une session décodée est une PROJECTION.** `userMinimalSchema` porte
 * `isOnline` : il n'entre pas — la présence d'autrui ne se sert que par sa loi
 * (`resolvePresenceVisibility`) et ne se persiste jamais (D-60). Le TYPE de
 * l'appel se lit dans `metadata.type` et nulle part ailleurs (`mode` est
 * l'architecture WebRTC, `p2p`/`sfu`).
 */

export type CallSessionMember = { readonly userId: string; readonly name: string; readonly avatar: string | null };

export type CallSession = {
  readonly callId: string;
  readonly conversationId: string;
  readonly media: 'audio' | 'video';
  readonly live: boolean;
  readonly initiatorId: string | null;
  readonly answered: boolean;
  readonly startedAt: string | null;
  readonly durationSec: number;
  /** Les membres encore présents (`leftAt` vide), lecteur compris. */
  readonly participants: readonly CallSessionMember[];
};

export const ACTIVE_CALL_QUERY_KEY = ['calls', 'active'] as const;
export const callSessionQueryKey = (callId: string) => ['calls', 'session', callId] as const;
export const conversationActiveCallQueryKey = (conversationId: string) => ['calls', 'in', conversationId] as const;

const TERMINAL = new Set(['ended', 'missed', 'rejected', 'failed']);

const optionalText = z.optional(z.nullable(z.string()));

const WireUser = z.object({ id: z.optional(z.string()), username: optionalText, displayName: optionalText, avatar: optionalText });

const WireParticipant = z.object({ userId: optionalText, leftAt: z.optional(z.unknown()), user: z.optional(z.nullable(WireUser)) });

const WireSession = z.object({
  id: z.string().check(z.minLength(1)),
  conversationId: z.string().check(z.minLength(1)),
  initiatorId: optionalText,
  status: optionalText,
  metadata: z.optional(z.nullable(z.object({ type: optionalText }))),
  startedAt: optionalText,
  answeredAt: optionalText,
  duration: z.optional(z.nullable(z.number())),
  participants: z.optional(z.nullable(z.array(z.unknown()))),
});

const filled = (value: string | null | undefined): string | null => (value === undefined || value === null || value.trim() === '' ? null : value);

const isoOrNull = (value: string | null | undefined): string | null => {
  const text = filled(value);
  return text !== null && Number.isFinite(Date.parse(text)) ? new Date(text).toISOString() : null;
};

function decodeMember(raw: unknown): CallSessionMember | null {
  const parsed = WireParticipant.safeParse(raw);
  if (!parsed.success) return null;
  const { userId, leftAt, user } = parsed.data;
  if (leftAt !== undefined && leftAt !== null) return null;
  const id = filled(userId) ?? filled(user?.id);
  if (id === null) return null;
  const name = filled(user?.displayName) ?? filled(user?.username) ?? '';
  return { userId: id, name, avatar: filled(user?.avatar) };
}

export function decodeCallSession(raw: unknown): CallSession | null {
  const parsed = WireSession.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const status = filled(wire.status) ?? 'initiated';
  return {
    callId: wire.id,
    conversationId: wire.conversationId,
    media: wire.metadata?.type === 'video' ? 'video' : 'audio',
    live: !TERMINAL.has(status),
    initiatorId: filled(wire.initiatorId),
    answered: filled(wire.answeredAt) !== null,
    startedAt: isoOrNull(wire.startedAt),
    durationSec: typeof wire.duration === 'number' && Number.isFinite(wire.duration) && wire.duration > 0 ? Math.floor(wire.duration) : 0,
    participants: (wire.participants ?? []).flatMap((entry) => {
      const member = decodeMember(entry);
      return member === null ? [] : [member];
    }),
  };
}

type Deps = Pick<CallsDeps, 'source' | 'transport'>;

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadActiveCall(deps: Deps, signal?: AbortSignal): Promise<ApiResult<CallSession | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureActiveCall } = await import('./fixtures-calls');
    return { ok: true, data: fixtureActiveCall() };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: '/api/v1/calls/active', ...withSignal(signal) });
  if (!result.ok) return result.status === 404 ? { ok: true, data: null } : result;
  const session = decodeCallSession(result.data);
  return { ok: true, data: session !== null && session.live ? session : null };
}

export async function loadCallSession(deps: Deps, callId: string, signal?: AbortSignal): Promise<ApiResult<CallSession | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureCallSession } = await import('./fixtures-calls');
    return { ok: true, data: fixtureCallSession(callId) };
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: `/api/v1/calls/${encodeURIComponent(callId)}`, ...withSignal(signal) });
  if (!result.ok) return result.status === 400 || result.status === 403 || result.status === 404 ? { ok: true, data: null } : result;
  return { ok: true, data: decodeCallSession(result.data) };
}

export async function loadConversationActiveCallId(deps: Deps, conversationId: string, signal?: AbortSignal): Promise<ApiResult<string | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureActiveCall } = await import('./fixtures-calls');
    const active = fixtureActiveCall();
    return { ok: true, data: active !== null && active.conversationId === conversationId ? active.callId : null };
  }
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/conversations/${encodeURIComponent(conversationId)}/active-call`,
    ...withSignal(signal),
  });
  if (!result.ok) return result;
  const session = decodeCallSession(result.data);
  return { ok: true, data: session !== null && session.live ? session.callId : null };
}
