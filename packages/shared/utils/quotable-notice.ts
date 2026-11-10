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

import { JOIN_NOTICE_KIND } from './join-notice.js';
import { ARRIVALS_NOTICE_KIND } from './arrivals-notice.js';

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
