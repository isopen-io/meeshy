import { sortConversations } from '@meeshy/shared/utils/conversation-sections';

import { effectiveFlagsOf, effectiveUnreadOf, type ConversationOverride } from '@/lib/conversation-store';
import { titleOf } from '@/lib/view/conversation';
import { listRankField } from '@/lib/api/list-preview';
import { reactionOf } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { rowMenuText, type RowMenuCatalogKey } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LES FILTRES DE LA LISTE (#5559 §5.5, composés depuis #10598).
 *
 * LOI iOS DE RÉFÉRENCE : `ConversationFilterComposition.swift` et
 * `ConversationListViewModel.filterConversations` (`:576-626`). La sélection
 * est un ENSEMBLE, et sa lecture suit la nature de chaque filtre :
 *
 * - les TYPES (Personnel · Privée · Ouvertes · Globales · Channels) se
 *   combinent par un OU — une conversation n'est jamais de deux types, un ET
 *   rendrait l'écran vide ;
 * - les ÉTATS (Non lus · Favoris · Épinglés) se combinent par un ET, et se
 *   CROISENT avec les types ;
 * - « Tous » est l'absence de filtre : le choisir efface les autres, en
 *   choisir un autre l'efface, et une sélection vidée y revient ;
 * - « Archivées » CHANGE DE CORPUS (`:598-601`, « sans ce gate, une archivée
 *   reparaîtrait dans "Non lus" ») : hors de lui, une archivée n'apparaît
 *   nulle part ; avec lui, elle se compose avec types et états.
 *
 * « Épinglés » n'existe pas sur iOS, qui range les épinglées dans une SECTION ;
 * le web le garde comme état, à sa place dans l'ordre d'iOS avant les archives.
 * La recherche matche le nom AFFICHÉ (`titleOf`, qui porte `customName`).
 */
export type ListFilter =
  | 'all'
  | 'unread'
  | 'personal'
  | 'private'
  | 'open'
  | 'global'
  | 'channels'
  | 'favorites'
  | 'pinned'
  | 'archived';

/** La sélection, rangée dans l'ordre des puces — jamais vide (`NEUTRAL_SELECTION`). */
export type ListSelection = readonly ListFilter[];

/** L'ordre des puces : `MeeshyConversationFilter.allCases`, plus « Épinglés ». */
export const LIST_FILTERS: readonly ListFilter[] = ['all', 'unread', 'personal', 'private', 'open', 'global', 'channels', 'favorites', 'pinned', 'archived'];

export const NEUTRAL_SELECTION: ListSelection = ['all'];

type TypeFilter = 'personal' | 'private' | 'open' | 'global' | 'channels';
type StateFilter = 'unread' | 'favorites' | 'pinned';

/** Les libellés des puces, dans la langue d'interface — mots d'iOS (`conversation.filter.*`). */
const FILTER_LABEL_KEYS: Readonly<Record<ListFilter, RowMenuCatalogKey>> = {
  all: 'listFilter.all',
  unread: 'listFilter.unread',
  personal: 'listFilter.personal',
  private: 'listFilter.private',
  open: 'listFilter.open',
  global: 'listFilter.global',
  channels: 'listFilter.channels',
  favorites: 'listFilter.favorites',
  pinned: 'listFilter.pinned',
  archived: 'listFilter.archived',
};

export const filterLabel = (filter: ListFilter, language: InterfaceLanguage): string => rowMenuText(language, FILTER_LABEL_KEYS[filter]);

const isNeutral = (selection: ListSelection): boolean => selection.length === 0 || selection.includes('all');

/** Un appui sur `filter` : il s'ajoute s'il manque, il PART s'il est là. */
export function toggleFilter(filter: ListFilter, selection: ListSelection): ListSelection {
  if (filter === 'all') return NEUTRAL_SELECTION;
  const current = isNeutral(selection) ? [] : selection;
  const next = current.includes(filter) ? current.filter((f) => f !== filter) : [...current, filter];
  return next.length === 0 ? NEUTRAL_SELECTION : LIST_FILTERS.filter((f) => next.includes(f));
}

/** Ce que l'état vide nomme : les libellés de la sélection, dans l'ordre des puces. */
export const selectionLabel = (selection: ListSelection, language: InterfaceLanguage): string =>
  (isNeutral(selection) ? NEUTRAL_SELECTION : selection).map((f) => filterLabel(f, language)).join(' · ');

type Overrides = Readonly<Record<string, ConversationOverride>>;

const TYPE_MATCH: Readonly<Record<TypeFilter, (c: Conversation) => boolean>> = {
  personal: (c) => c.type === 'direct',
  private: (c) => c.type === 'group',
  open: (c) => c.type === 'public',
  global: (c) => c.type === 'global',
  channels: (c) => c.isAnnouncementChannel === true,
};

const STATE_MATCH: Readonly<Record<StateFilter, (c: Conversation, overrides: Overrides) => boolean>> = {
  unread: (c, overrides) => effectiveUnreadOf(c, overrides) > 0,
  /* `.favoris` d'iOS (`ConversationListViewModel.swift:617`) : un emoji posé. */
  favorites: (c) => reactionOf(c) !== undefined,
  pinned: (c, overrides) => effectiveFlagsOf(c, overrides).isPinned,
};

const isTypeFilter = (f: ListFilter): f is TypeFilter => f in TYPE_MATCH;
const isStateFilter = (f: ListFilter): f is StateFilter => f in STATE_MATCH;

export function applyFilter(params: {
  readonly conversations: readonly Conversation[];
  readonly selection: ListSelection;
  readonly search: string;
  readonly viewerId: string;
  readonly overrides: Overrides;
}): readonly Conversation[] {
  const { conversations, selection, search, viewerId, overrides } = params;
  const query = search.trim().toLowerCase();
  const active = isNeutral(selection) ? [] : selection;
  const wantsArchived = active.includes('archived');
  const types = active.filter(isTypeFilter);
  const states = active.filter(isStateFilter);

  return conversations.filter(
    (c) =>
      effectiveFlagsOf(c, overrides).isArchived === wantsArchived &&
      (types.length === 0 || types.some((t) => TYPE_MATCH[t](c))) &&
      states.every((s) => STATE_MATCH[s](c, overrides)) &&
      (query.length === 0 || titleOf(c, viewerId).toLowerCase().includes(query)),
  );
}

/**
 * L'ORDRE — adapte chaque `Conversation` en `SectionableConversation`
 * (loi PARTAGÉE, `@meeshy/shared/utils/conversation-sections`, jamais un tri
 * réécrit) puis reprojette le résultat sur les objets d'origine. `isPinned`
 * porte les flags EFFECTIFS (wire fusionné à l'override) : une conversation
 * épinglée localement, avant toute confirmation serveur, doit déjà monter en
 * tête — c'est le point que `sortConversations` seul ne peut pas garantir
 * puisqu'il ne connaît que ce qu'on lui fournit.
 *
 * Ni `categoryId` ni `liveCall` ne sont posés aujourd'hui (§1.4 : aucune des
 * deux dimensions n'est câblée côté web-v2) — `sortConversations` dégénère
 * alors naturellement sur `lastMessageAt` desc, repli `updatedAt`, `id`.
 */
export function orderConversations(
  conversations: readonly Conversation[],
  overrides: Overrides,
): readonly Conversation[] {
  const byId = new Map(conversations.map((c) => [c.id, c] as const));
  const sectionable = conversations.map((c) => ({
    id: c.id,
    isPinned: effectiveFlagsOf(c, overrides).isPinned,
    // `exactOptionalPropertyTypes` : la loi partagée déclare `lastMessageAt?:
    // Date | null`, donc écrire explicitement `undefined` est refusé — on
    // n'écrit la clé que lorsqu'elle a une valeur (même garde que
    // `api/prism.ts` sur `originalLanguage`).
    // LE RANG SERVI (#7592) : max(rang du lecteur, `lastMessageAt`).
    ...listRankField(c),
    updatedAt: c.updatedAt,
  }));
  return sortConversations(sectionable)
    .map((s) => byId.get(s.id))
    .filter((c): c is Conversation => c !== undefined);
}

export type Emptiness = 'none' | 'empty-corpus' | 'empty-filter';

/**
 * DEUX états VIDES distincts (#5559 T15) : le corpus BRUT est vide (aucune
 * conversation du tout — le bloc de queue bascule en mode « démarrage »,
 * `ConversationListQuickActions.isEmptyState`) contre un filtre/une
 * recherche qui ne rend rien sur un corpus non vide (l'état pointillé
 * existant de `routes/conversations.tsx`).
 */
export function emptinessOf(corpus: readonly unknown[], visible: readonly unknown[]): Emptiness {
  if (corpus.length === 0) return 'empty-corpus';
  if (visible.length === 0) return 'empty-filter';
  return 'none';
}
