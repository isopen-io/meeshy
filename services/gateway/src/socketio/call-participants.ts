/**
 * QUI parle, sous quel identifiant — extrait de `CallEventsHandler.ts`
 * (#7632, budget de taille).
 *
 * Une responsabilité : répondre, pour un `userId` authentifié et un appel
 * donné, par QUEL identifiant la passerelle le connaît — et à quel titre il a
 * le droit d'écrire sur cet appel.
 *
 * Ce module existe parce que la question a HUIT réponses, et que s'en tromper
 * ne lève rien : chaque fonction nomme une garde différente, de la plus laxiste
 * (membre de la CONVERSATION) à la plus stricte (participant ACTIF de CET
 * appel). Un contrôle qui prend la première pour la dernière laisse un membre
 * qui n'a jamais décroché écrire dans l'état d'un appel en cours.
 *
 * Les deux espaces d'identifiants ne se confondent pas non plus, et le
 * doc-comment de `resolveActiveCallParticipant` porte le prix de la confusion :
 * `participantId` (FK vers `Participant.id`) et `userId` ne matchent pas la
 * même entrée de roster, et une alerte qui ne transporte que le premier rend
 * un nom de pair VIDE chez le lecteur.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { CallService } from '../services/CallService';
import { logger } from '../utils/logger';

/** Ce que ces résolveurs empruntent à l'instance — résolu à l'APPEL, jamais capturé. */
export type CallParticipantResolverDeps = {
  readonly prisma: PrismaClient;
  readonly callService: CallService;
};

export async function resolveParticipantId(deps: CallParticipantResolverDeps, userId: string, conversationId: string): Promise<string | null> {
  const participant = await deps.prisma.participant.findFirst({
    where: { userId, conversationId, isActive: true },
    select: { id: true }
  });
  return participant?.id ?? null;
}

export async function resolveParticipantIdFromCall(deps: CallParticipantResolverDeps, userId: string, callId: string): Promise<string | null> {
  const call = await deps.prisma.callSession.findUnique({
    where: { id: callId },
    select: { conversationId: true }
  });
  if (!call) return null;
  return resolveParticipantId(deps, userId, call.conversationId);
}

/**
 * Resolve the caller's own CallParticipant row, verifying they are an
 * ACTIVE participant of THIS specific call — unlike
 * `resolveParticipantIdFromCall`, which only checks conversation
 * membership. A conversation member who never joined (or already left)
 * this call must not pass authorization checks gating writes against call
 * state/stats (quality reports, media toggles, background/foreground,
 * reconnect status).
 *
 * Returns BOTH identifier spaces the caller is known by:
 * - `participantId` — `CallParticipant.participantId`, the FK to the
 *   conversation's `Participant.id` row. Legacy value, still relayed
 *   verbatim on `call:quality-alert`/`call:screen-capture-alert` for
 *   backward compat.
 * - `userId` — `Participant.userId` for a registered user, falling back to
 *   `participantId` for an anonymous guest (no `User` row to point at).
 *   Mirrors `toCallParticipantResponse`'s own `userId` derivation exactly
 *   (`call-session-response.ts`), which is what every call ROSTER entry's
 *   `.userId` is populated from — a side-channel alert that only carries
 *   `participantId` can never match a roster lookup keyed by `userId` for a
 *   registered peer (Vague 132: both alert overlays silently rendered a
 *   blank peer name because of exactly this mismatch).
 */
export async function resolveActiveCallParticipant(
  deps: CallParticipantResolverDeps,
  userId: string,
  callId: string
): Promise<{ participantId: string; userId: string } | null> {
  const resolved = await resolveActiveCallParticipantDetailed(deps, userId, callId);
  if (!resolved) return null;
  return { participantId: resolved.participantId, userId: resolved.userId };
}

/**
 * Same resolution as `resolveActiveCallParticipant`, but also surfaces the
 * call-type/roster context needed by `call:end` to tell a genuine
 * end-for-everyone apart from a group-call participant merely hanging up
 * on themselves (calling-stack audit 2026-08-16) — computed from the SAME
 * `getCallSession` read every other call site here already pays for, so
 * exposing it costs no extra query for the 9+ existing callers that only
 * destructure `{ participantId, userId }`.
 */
export async function resolveActiveCallParticipantDetailed(
  deps: CallParticipantResolverDeps,
  userId: string,
  callId: string
): Promise<{
  id: string;
  participantId: string;
  userId: string;
  mode: Awaited<ReturnType<CallService['getCallSession']>>['mode'];
  isDirectCall: boolean;
  hasOtherActiveParticipants: boolean;
} | null> {
  try {
    const callSession = await deps.callService.getCallSession(callId);
    const activeParticipant = callSession.participants.find(
      (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
    );
    if (!activeParticipant) return null;
    return {
      id: activeParticipant.id,
      participantId: activeParticipant.participantId,
      userId: activeParticipant.participant?.userId ?? activeParticipant.participantId,
      mode: callSession.mode,
      isDirectCall: callSession.conversation?.type === 'direct',
      hasOtherActiveParticipants: callSession.participants.some(
        (p) => !p.leftAt && p.id !== activeParticipant.id
      )
    };
  } catch (error) {
    // A genuine "not a participant" resolves via the `.find()` above
    // returning undefined, never via this catch — reaching here means
    // getCallSession itself failed (DB timeout, connection drop, bug), which
    // is otherwise indistinguishable from "not a participant" and silently
    // drops the caller's toggle/heartbeat/quality-report with zero trace.
    logger.warn('resolveActiveCallParticipant: getCallSession failed, treating caller as unauthorized', {
      userId,
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Thin wrapper over `resolveActiveCallParticipant` for the (majority) call
 * sites that only need the legacy `CallParticipant.participantId` value.
 */
export async function resolveActiveCallParticipantId(deps: CallParticipantResolverDeps, userId: string, callId: string): Promise<string | null> {
  const resolved = await resolveActiveCallParticipant(deps, userId, callId);
  return resolved?.participantId ?? null;
}

/**
 * Authorizes a callee declining a call they were invited to but never
 * joined. `call:join` is the only path that creates a CallParticipant row
 * for a callee — `call:initiate` creates one only for the initiator — so a
 * callee who taps "Decline" while still ringing legitimately has NO row
 * for `resolveActiveCallParticipantId` to find, and that check correctly
 * (by design) returns null for them. That is a DIFFERENT case from the one
 * 2026-07-10b actually closed: a caller who HAD a row and left it, then
 * replayed `call:end` from a stale socket. Disambiguate explicitly — a
 * caller who already has ANY row for this call (active or left) must keep
 * going through `resolveActiveCallParticipantId` and stay blocked here.
 * Decline-before-join regression fix, 2026-08-14.
 */
export async function resolvePreJoinDeclineParticipantId(deps: CallParticipantResolverDeps, userId: string, callId: string): Promise<string | null> {
  try {
    const callSession = await deps.callService.getCallSession(callId);
    // Pre-join decline only makes sense while nobody has ever answered —
    // once the call is truly under way, a "never joined" decline has no
    // meaning and hangup must go through the active-participant path.
    if (callSession.answeredAt) return null;
    const hasAnyRow = callSession.participants.some(
      (p) => (p.participant?.userId ?? p.participantId) === userId
    );
    if (hasAnyRow) return null;
    // No CallParticipant row at all: this user never joined this call.
    // Only a genuine conversation member may decline it — keeps a
    // stranger who merely guessed/observed the callId from ending it.
    return resolveParticipantIdFromCall(deps, userId, callId);
  } catch (error) {
    logger.warn('resolvePreJoinDeclineParticipantId: getCallSession failed, treating caller as unauthorized', {
      userId,
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Resolve the caller as an active participant of THIS call, returning both
 * the authorization proof (`participantId`) and the server-trusted
 * `displayName` (user.displayName ?? username) stamped onto relayed
 * transcription segments. Same authorization semantics as
 * `resolveActiveCallParticipantId`; the display name rides along because
 * `getCallSession` already includes each participant's user record — no
 * extra query. `null` displayName (no linked user) simply omits the field
 * from the wire, receivers fall back to their local roster.
 */
export async function resolveActiveCallSpeaker(
  deps: CallParticipantResolverDeps,
  userId: string,
  callId: string
): Promise<{ participantId: string; displayName: string | null } | null> {
  try {
    const callSession = await deps.callService.getCallSession(callId);
    const activeParticipant = callSession.participants.find(
      (p) => ((p.participant?.userId ?? p.participantId) === userId) && !p.leftAt
    );
    if (!activeParticipant) return null;
    const user = activeParticipant.participant?.user;
    return {
      participantId: activeParticipant.participantId,
      displayName: user?.displayName ?? user?.username ?? null
    };
  } catch (error) {
    // See resolveActiveCallParticipantId — same rationale: a getCallSession
    // failure must be logged, not silently folded into "not a participant".
    logger.warn('resolveActiveCallSpeaker: getCallSession failed, treating caller as unauthorized', {
      userId,
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Resolve the caller's own CallParticipant.participantId for THIS call,
 * regardless of `leftAt` — unlike `resolveActiveCallParticipantId`, a
 * participant who has already left this call still resolves (needed by
 * call:analytics, which fires post-hangup). Unlike
 * `resolveParticipantIdFromCall`, which only checks conversation
 * membership, a conversation member who never joined this specific call
 * resolves to null — closing the gap where any member of the conversation
 * could submit fabricated telemetry against a call they were never part
 * of.
 */
export async function resolveEverCallParticipantId(deps: CallParticipantResolverDeps, userId: string, callId: string): Promise<string | null> {
  try {
    const callSession = await deps.callService.getCallSession(callId);
    const everParticipant = callSession.participants.find(
      (p) => (p.participant?.userId ?? p.participantId) === userId
    );
    return everParticipant?.participantId ?? null;
  } catch (error) {
    // See resolveActiveCallParticipantId — same rationale: a getCallSession
    // failure must be logged, not silently folded into "not a participant".
    logger.warn('resolveEverCallParticipantId: getCallSession failed, treating caller as unauthorized', {
      userId,
      callId,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}