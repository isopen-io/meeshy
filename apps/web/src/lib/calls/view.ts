import type { InfiniteData } from '@tanstack/react-query';

import {
  CALL_HISTORY_FILTERS,
  CALL_HISTORY_TYPES,
  type CallHistoryFilter,
  type CallHistoryPage,
  type CallHistoryRefine,
  type CallHistoryType,
  type CallRecord,
} from '@/lib/api/calls';

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

/**
 * **QUI ÉTAIT DANS L'APPEL DE GROUPE** (#8066) — les `limit` premiers noms
 * pour la ligne, et combien d'autres ; rien pour un appel direct, que son
 * pair nomme déjà.
 */
export function callParticipantNames(record: Pick<CallRecord, 'participants'>, limit: number): { readonly names: readonly string[]; readonly more: number } {
  const names = record.participants.map((participant) => participant.displayName);
  return { names: names.slice(0, limit), more: Math.max(0, names.length - limit) };
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
 * sur le nom AFFICHÉ (repli compris), l'identifiant du pair et les participants
 * d'un appel de groupe, sans accents ni
 * casse. Elle filtre ce qui est CHARGÉ ; l'écran charge la suite pendant qu'on
 * cherche, pour qu'un appel ancien finisse par apparaître.
 */
export function searchCallRecords(records: readonly CallRecord[], query: string, unknown: string): readonly CallRecord[] {
  const needle = foldForSearch(query);
  if (needle === '') return records;
  return records.filter((record) =>
    [callDisplayNameOf(record, unknown), record.peer?.username, ...record.participants.flatMap((participant) => [participant.displayName, participant.username])].some(
      (field) => nonEmpty(field) && foldForSearch(field).includes(needle),
    ),
  );
}

export const CALL_TYPE_PARAM = 'type';

export function callTypeFromSearch(raw: string | null): CallHistoryType {
  return CALL_HISTORY_TYPES.find((type) => type === raw) ?? 'all';
}

const matchesType = (record: CallRecord, type: CallHistoryType): boolean =>
  type === 'all' || (type === 'video') === record.isVideo;

/** Le raffinement (#8203) appliqué à des lignes déjà là — la même règle que la passerelle. */
export function refineCallRecords(records: readonly CallRecord[], refine: CallHistoryRefine, unknown: string): CallRecord[] {
  return searchCallRecords(records, refine.q, unknown).filter((record) => matchesType(record, refine.type));
}

/**
 * **LE JOURNAL RAFFINÉ SE PEINT DEPUIS LE CACHE** (#8203) — pendant que la
 * passerelle cherche, les lignes déjà chargées qui correspondent s'affichent
 * au lieu d'un squelette. Sans curseur : la page suivante est celle que la
 * passerelle rendra, jamais une page du journal entier.
 */
export function refinedCallHistory(
  cached: CallHistoryData | undefined,
  refine: CallHistoryRefine,
  unknown: string,
): CallHistoryData | undefined {
  if (cached === undefined || (refine.type === 'all' && refine.q.trim() === '')) return undefined;
  const records = refineCallRecords(cached.pages.flatMap((page) => page.records), refine, unknown);
  return { pages: [{ records, nextCursor: null }], pageParams: [null] };
}
