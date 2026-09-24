/**
 * Arrivées regroupées — « Aïcha, Tom et 12 autres viennent d'arriver — dis-leur
 * salut » (#7740).
 *
 * Tout nouveau compte rejoint Meeshy Global, et chaque arrivée y postait sa
 * propre ligne « X a rejoint la conversation ». Une vague d'inscriptions
 * noyait donc le salon sous les avis d'arrivée. Dans le salon global, les
 * arrivées d'une même fenêtre de dix minutes partagent UNE ligne système, que
 * chaque nouvel arrivant met à jour au lieu d'en poster une autre.
 *
 * Même contrat que l'avis d'arrivée individuel (`join-notice.ts`) : le sens
 * voyage dans `metadata`, le `content` n'est qu'un repli français pour les
 * surfaces et les clients qui ne connaissent pas ce `kind` — ils l'affichent
 * tel quel, sans rien casser.
 */

import {
  conversationPreviewString,
  type ConversationPreviewStringKey,
} from './conversation-preview-strings.js';

export const ARRIVALS_NOTICE_KIND = 'members-arrived' as const;

/** Largeur de la fenêtre pendant laquelle les arrivées partagent une ligne. */
export const ARRIVALS_NOTICE_WINDOW_MINUTES = 10;

/** Noms gardés dans `metadata` — le compte, lui, n'est jamais borné. */
export const ARRIVALS_NOTICE_STORED_LIMIT = 20;

export type ArrivalsNoticeArrival = {
  readonly participantId: string;
  readonly displayName: string;
};

export type ArrivalsNoticeMetadata = {
  readonly kind: typeof ARRIVALS_NOTICE_KIND;
  /** Les derniers arrivés EN TÊTE : ce sont eux qu'on invite à saluer. */
  readonly arrivals: readonly ArrivalsNoticeArrival[];
  /** Nombre total d'arrivées de la fenêtre, noms gardés ou non. */
  readonly count: number;
  /** ISO 8601 — l'instant où la ligne a été ouverte. */
  readonly windowStartedAt: string;
};

export function startArrivalsNotice(arrival: ArrivalsNoticeArrival, windowStartedAt: string): ArrivalsNoticeMetadata {
  return { kind: ARRIVALS_NOTICE_KIND, arrivals: [arrival], count: 1, windowStartedAt };
}

export function withArrival(notice: ArrivalsNoticeMetadata, arrival: ArrivalsNoticeArrival): ArrivalsNoticeMetadata {
  if (notice.arrivals.some((known) => known.participantId === arrival.participantId)) return notice;
  return {
    ...notice,
    arrivals: [arrival, ...notice.arrivals].slice(0, ARRIVALS_NOTICE_STORED_LIMIT),
    count: notice.count + 1,
  };
}

type ArrivalsLineKey = Extract<
  ConversationPreviewStringKey,
  'system.members.arrived.one' | 'system.members.arrived.two' | 'system.members.arrived.three' | 'system.members.arrived.many'
>;

export type ArrivalsNoticeLine = {
  readonly key: ArrivalsLineKey;
  readonly params: { readonly first: string; readonly second: string; readonly third: string; readonly others: number };
};

/** La clé qui dit une ligne de `count` arrivées — partagée avec la ligne de liste. */
export function arrivalsLineKey(count: number): ArrivalsLineKey {
  if (count <= 1) return 'system.members.arrived.one';
  if (count === 2) return 'system.members.arrived.two';
  if (count === 3) return 'system.members.arrived.three';
  return 'system.members.arrived.many';
}

/**
 * Trois arrivées au plus se nomment toutes ; au-delà, deux noms et le nombre
 * des autres. Les noms sont ceux des DERNIERS arrivés.
 */
export function arrivalsNoticeLine(notice: ArrivalsNoticeMetadata): ArrivalsNoticeLine {
  const key = arrivalsLineKey(notice.count);
  const named = key === 'system.members.arrived.many' ? 2 : Math.min(notice.count, 3);
  const names = notice.arrivals.slice(0, named).map((arrival) => arrival.displayName);
  return {
    key,
    params: {
      first: names[0] ?? '',
      second: names[1] ?? '',
      third: names[2] ?? '',
      others: Math.max(0, notice.count - names.length),
    },
  };
}

export function arrivalsNoticeText(notice: ArrivalsNoticeMetadata, language: string): string {
  const line = arrivalsNoticeLine(notice);
  return conversationPreviewString(language, line.key, line.params);
}

/** Le `content` stocké — repli français, jamais la vérité affichée. */
export function arrivalsNoticeFallbackContent(notice: ArrivalsNoticeMetadata): string {
  return arrivalsNoticeText(notice, 'fr');
}

function parseArrival(raw: unknown): ArrivalsNoticeArrival | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.participantId !== 'string' || !record.participantId) return null;
  if (typeof record.displayName !== 'string' || !record.displayName) return null;
  return { participantId: record.participantId, displayName: record.displayName };
}

/**
 * Lit `Message.metadata` comme une ligne d'arrivées regroupées, ou rend `null`.
 * Valide plutôt que caste : `metadata` est partagé par toutes les familles de
 * messages système. Un arrivant malformé est écarté sans perdre les autres.
 */
export function parseArrivalsNotice(metadata: unknown): ArrivalsNoticeMetadata | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = metadata as Record<string, unknown>;
  if (raw.kind !== ARRIVALS_NOTICE_KIND) return null;
  if (!Array.isArray(raw.arrivals)) return null;
  if (typeof raw.count !== 'number' || !Number.isFinite(raw.count)) return null;
  if (typeof raw.windowStartedAt !== 'string') return null;

  const arrivals = raw.arrivals
    .map(parseArrival)
    .filter((arrival): arrival is ArrivalsNoticeArrival => arrival !== null);
  if (arrivals.length === 0) return null;

  return {
    kind: ARRIVALS_NOTICE_KIND,
    arrivals,
    count: Math.max(Math.floor(raw.count), arrivals.length),
    windowStartedAt: raw.windowStartedAt,
  };
}
