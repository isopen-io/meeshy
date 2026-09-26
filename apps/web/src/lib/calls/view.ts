import type { InfiniteData } from '@tanstack/react-query';

import { CALL_HISTORY_FILTERS, type CallHistoryFilter, type CallHistoryPage, type CallRecord } from '@/lib/api/calls';

/**
 * **LES RÈGLES PURES DU JOURNAL D'APPELS** (#6362) — miroir des accesseurs de
 * `APICallRecord` (`CallModels.swift` § Display Accessors), sans DOM ni requête.
 */

export type CallHistoryData = InfiniteData<CallHistoryPage, string | null>;

const pad = (value: number): string => String(value).padStart(2, '0');

/** `durationLabel` d'iOS : `M:SS`, `H:MM:SS` passé une heure, vide pour un appel sans durée. */
export function callDurationLabel(durationSec: number): string {
  if (durationSec <= 0) return '';
  const hours = Math.floor(durationSec / 3600);
  const minutes = Math.floor((durationSec % 3600) / 60);
  const seconds = durationSec % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

const nonEmpty = (value: string | null | undefined): value is string => value !== undefined && value !== null && value !== '';

/** `displayName(fallback:)` d'iOS : nom du pair → son identifiant → titre du groupe → le repli, fourni par l'appelant. */
export function callDisplayNameOf(record: Pick<CallRecord, 'peer' | 'conversationTitle'>, unknown: string): string {
  return [record.peer?.displayName, record.peer?.username, record.conversationTitle].find(nonEmpty) ?? unknown;
}

/** `avatarURL` d'iOS : le portrait du pair, sinon celui de la conversation. */
export function callAvatarOf(record: Pick<CallRecord, 'peer' | 'conversationAvatar'>): string | null {
  return record.peer?.avatar ?? record.conversationAvatar;
}

export const CALL_FILTER_PARAM = 'filtre';

export function callFilterFromSearch(raw: string | null): CallHistoryFilter {
  return CALL_HISTORY_FILTERS.find((filter) => filter === raw) ?? 'all';
}

/**
 * **« MANQUÉS » SE PEINT DEPUIS « TOUS » DÉJÀ EN CACHE** — la direction est
 * dérivée par la passerelle de la même façon pour les deux filtres
 * (`deriveCallDirection`), donc les lignes `missed` de la liste complète sont
 * exactement celles que le filtre servira. Deux cas refusent d'emprunter :
 * rien en cache (le squelette est juste), et une liste TRONQUÉE sans aucun
 * manqué (un vide dessiné mentirait sur ce que les pages suivantes portent).
 */
export function seededCallHistory(cached: CallHistoryData | undefined, filter: CallHistoryFilter): CallHistoryData | undefined {
  if (filter === 'all' || cached === undefined) return undefined;
  const records = cached.pages.flatMap((page) => page.records).filter((record) => record.direction === 'missed');
  const truncated = (cached.pages.at(-1)?.nextCursor ?? null) !== null;
  if (records.length === 0 && truncated) return undefined;
  return { pages: [{ records, nextCursor: null }], pageParams: [null] };
}

const foldForSearch = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().trim();

/**
 * **LA RECHERCHE DU JOURNAL** (#8066) — le `.searchable` de `CallsTab.swift` :
 * sur le nom AFFICHÉ (repli compris) et l'identifiant du pair, sans accents ni
 * casse. Elle filtre ce qui est CHARGÉ ; l'écran charge la suite pendant qu'on
 * cherche, pour qu'un appel ancien finisse par apparaître.
 */
export function searchCallRecords(records: readonly CallRecord[], query: string, unknown: string): readonly CallRecord[] {
  const needle = foldForSearch(query);
  if (needle === '') return records;
  return records.filter((record) =>
    [callDisplayNameOf(record, unknown), record.peer?.username].some((field) => nonEmpty(field) && foldForSearch(field).includes(needle)),
  );
}
