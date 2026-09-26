import { formatPreviewFileSize } from '@meeshy/shared/utils/conversation-preview-strings';

import type { CallSession } from '@/lib/api/call-sessions';
import type { CallDirection, CallRecord } from '@/lib/api/calls';

import type { CallIdentity } from './call-notice';
import type { CallMedia } from './call-store';
import { callAvatarOf, callDisplayNameOf, type CallHistoryData } from './view';

/**
 * **LA FICHE D'UN APPEL** (#6383) — miroir de `CallDetailSheet.swift` : le nom
 * et l'avatar, la direction, puis Type, Date (absolue), Durée et Données.
 *
 * **Le numéro du pair n'y est pas, et n'y entrera pas sans décision** (D-129).
 * iOS l'affiche depuis `peer.phoneNumber` ; le web ne le décode même pas
 * (`calls.ts`) : un numéro de téléphone est une donnée d'identité que la
 * passerelle sert sans loi de visibilité propre (aucune règle « qui a le droit
 * de voir le numéro de qui »), et le cache de requêtes est PERSISTÉ. Tant que
 * cette loi n'existe pas, la fiche ne montre rien — et aucun type de ce module
 * n'a de champ où le mettre.
 *
 * Deux sources : la ligne du journal déjà en cache (chemin nominal, rien à
 * attendre) ou, pour un lien profond sans cache, la session servie par
 * `GET /calls/:callId`, dont la direction se DÉRIVE comme la passerelle la
 * dérive pour le journal (`deriveCallDirection`) : l'initiateur a émis ; un
 * appel décroché est reçu ; sinon, manqué.
 */

export type CallDetail = {
  readonly callId: string;
  readonly conversationId: string;
  readonly name: string;
  readonly avatar: string | null;
  readonly direction: CallDirection;
  readonly media: CallMedia;
  readonly startedAt: string | null;
  readonly durationSec: number;
  readonly bytes: number | null;
  readonly isGroup: boolean;
  readonly live: boolean;
};

export function callDetailFromRecord(record: CallRecord, unknown: string): CallDetail {
  return {
    callId: record.callId,
    conversationId: record.conversationId,
    name: callDisplayNameOf(record, unknown),
    avatar: callAvatarOf(record),
    direction: record.direction,
    media: record.isVideo ? 'video' : 'audio',
    startedAt: record.startedAt,
    durationSec: record.durationSec,
    bytes: record.bytes,
    isGroup: record.conversationType !== 'direct',
    live: false,
  };
}

export function findCachedRecord(caches: readonly (CallHistoryData | undefined)[], callId: string): CallRecord | null {
  return caches.flatMap((cache) => cache?.pages.flatMap((page) => page.records) ?? []).find((entry) => entry.callId === callId) ?? null;
}

const directionOf = (session: CallSession, viewerId: string): CallDirection => {
  if (session.initiatorId !== null && session.initiatorId === viewerId) return 'outgoing';
  return session.answered ? 'incoming' : 'missed';
};

export function callDetailFromSession(
  session: CallSession,
  context: { readonly viewerId: string; readonly unknown: string; readonly identity?: CallIdentity | undefined },
): CallDetail {
  const others = session.participants.filter((member) => member.userId !== context.viewerId);
  const known = context.identity !== undefined && context.identity.title !== '' ? context.identity : null;
  const first = others[0];
  return {
    callId: session.callId,
    conversationId: session.conversationId,
    name: known?.title ?? (first !== undefined && first.name !== '' ? first.name : context.unknown),
    avatar: known === null ? (first?.avatar ?? null) : known.avatar,
    direction: directionOf(session, context.viewerId),
    media: session.media,
    startedAt: session.startedAt,
    durationSec: session.durationSec,
    bytes: null,
    isGroup: known?.isGroup ?? others.length > 1,
    live: session.live,
  };
}

export type DeepLinkPlan = 'join' | 'detail' | 'not-found';

export function deepLinkPlan(session: CallSession | null): DeepLinkPlan {
  if (session === null) return 'not-found';
  return session.live ? 'join' : 'detail';
}

/** `dataLabel` d'iOS : les octets des deux sens, aux unités de la langue ; `null` sans mesure. */
export function callDataLabel(bytes: number | null, language: string): string | null {
  return bytes === null || bytes <= 0 ? null : formatPreviewFileSize(language, bytes);
}

/** `startedAt.formatted(date: .abbreviated, time: .shortened)` d'iOS. */
export function callAbsoluteDate(iso: string | null, language: string, timeZone?: string): string {
  if (iso === null) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', ...(timeZone === undefined ? {} : { timeZone }) }).format(date);
}
