/**
 * LES AVIS QU'ON CITE (#17441) — un appel (manqué ou non), une arrivée (seule
 * ou regroupée) et un départ ANNONCÉ se citent : ils sont dans le fil, on y
 * répond comme à un message. Un départ que l'utilisateur n'a pas annoncé n'a
 * pas de ligne, donc rien à citer.
 *
 * Restent hors de la liste : l'avis de capture, que la passerelle refuse de
 * citer (#9629, `refusesContentGesture`) — la citation le recopierait hors de
 * son audience —, et les avis de vie du groupe (retrait, renommage, photo).
 *
 * Site UNIQUE, lu par la loi des actions (`messageActionsFor`) et par la
 * citation servie (`servedQuotedMessage`, passerelle).
 */

import { JOIN_NOTICE_KIND, parseJoinNotice } from './join-notice.js';
import { ARRIVALS_NOTICE_KIND, arrivalsNoticeText, parseArrivalsNotice } from './arrivals-notice.js';
import { parseConversationNotice } from './conversation-notice.js';
import { formatCallDuration } from './call-summary.js';
import { conversationPreviewString, type ConversationPreviewStringKey } from './conversation-preview-strings.js';

export const QUOTABLE_NOTICE_KINDS = ['call', 'call-live', JOIN_NOTICE_KIND, ARRIVALS_NOTICE_KIND, 'member-left'] as const;

export type QuotableNoticeKind = (typeof QUOTABLE_NOTICE_KINDS)[number];

export type QuotableNoticeSubject = {
  readonly messageType?: string | null;
  readonly metadata?: unknown;
};

const KINDS: ReadonlySet<string> = new Set(QUOTABLE_NOTICE_KINDS);

const isQuotableKind = (kind: unknown): kind is QuotableNoticeKind => typeof kind === 'string' && KINDS.has(kind);

/** La nature de l'avis citable que ce message porte, ou `null` : seul un message SYSTÈME est un avis. */
export function quotableNoticeKind(message: QuotableNoticeSubject): QuotableNoticeKind | null {
  if (message.messageType !== 'system') return null;
  const metadata = message.metadata;
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  const kind = (metadata as Record<string, unknown>)['kind'];
  return isQuotableKind(kind) ? kind : null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

/**
 * Un appel cité se dit comme la ligne de liste le dit (`callLine`,
 * `conversation-preview.ts`) : depuis sa synthèse, jamais depuis le texte
 * français stocké, et du point de vue du LECTEUR (`initiatorId` comparé à lui).
 */
function callNoticeKey(call: Record<string, unknown>, viewerId: string): ConversationPreviewStringKey {
  if (call['kind'] === 'call-live') return 'call.active';
  const outgoing = call['initiatorId'] === viewerId;
  switch (call['outcome']) {
    case 'missed':
      if (!outgoing) return 'call.missed';
      return call['endedByInitiator'] === true ? 'call.cancelled' : 'call.unanswered';
    case 'rejected':
      return 'call.declined';
    case 'failed':
      return 'call.failed';
    default:
      return call['callType'] === 'video' ? 'call.video' : 'call.audio';
  }
}

function callNoticeText(call: Record<string, unknown>, viewerId: string, language: string): string {
  const key = callNoticeKey(call, viewerId);
  const label = conversationPreviewString(language, key);
  const seconds = call['durationSeconds'];
  const completed = key === 'call.audio' || key === 'call.video';
  return completed && typeof seconds === 'number' && seconds > 0 ? `${label} · ${formatCallDuration(Math.round(seconds))}` : label;
}

function joinNoticeText(metadata: unknown, language: string): string | null {
  const notice = parseJoinNotice(metadata);
  if (notice === null) return null;
  const givenName = notice.givenName?.trim() ? notice.givenName : undefined;
  const name = givenName ?? notice.displayName;
  return notice.addedBy === undefined
    ? conversationPreviewString(language, 'system.member.joined', { actor: name })
    : conversationPreviewString(language, 'system.member.added', { actor: notice.addedBy.displayName, target: name });
}

function leftNoticeText(metadata: unknown, language: string): string | null {
  const notice = parseConversationNotice(metadata);
  return notice?.kind === 'member-left' ? conversationPreviewString(language, 'system.member.left', { actor: notice.actor.displayName }) : null;
}

function arrivalsText(metadata: unknown, language: string): string | null {
  const notice = parseArrivalsNotice(metadata);
  return notice === null ? null : arrivalsNoticeText(notice, language);
}

/**
 * CE QU'UNE CITATION D'AVIS DIT (#17441) — le texte de l'avis dans la langue du
 * lecteur, ou `null` quand la métadonnée n'est pas un avis citable lisible :
 * la citation retombe alors sur le `content` servi, repli français que les
 * anciens clients affichent déjà.
 */
export function quotedNoticeText(params: { readonly metadata: unknown; readonly viewerId: string; readonly language: string }): string | null {
  const { metadata, viewerId, language } = params;
  const record = asRecord(metadata);
  if (record === null) return null;
  switch (record['kind']) {
    case 'call':
    case 'call-live':
      return callNoticeText(record, viewerId, language);
    case JOIN_NOTICE_KIND:
      return joinNoticeText(metadata, language);
    case ARRIVALS_NOTICE_KIND:
      return arrivalsText(metadata, language);
    case 'member-left':
      return leftNoticeText(metadata, language);
    default:
      return null;
  }
}
