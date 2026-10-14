import { sortConversations } from '@meeshy/shared/utils/conversation-sections';

import { effectiveFlagsOf, effectiveUnreadOf, type ConversationOverride } from '@/lib/conversation-store';
import { isGroup, titleOf } from '@/lib/view/conversation';
import { listRankField } from '@/lib/api/list-preview';
import { reactionOf } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { rowMenuText, type RowMenuCatalogKey } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LES FILTRES DE LA LISTE (#5559 §5.5) — remplacent le tableau littéral de
 * `routes/conversations.tsx` (`['Tous', 'Non lus', …]`), qui déclarait
 * « Épinglés » sans jamais l'appliquer : un contrôle qui s'active sans
 * filtrer est un échec à demi (§ critère de fin de l'issue).
 *
 * LOI iOS DE RÉFÉRENCE : `ConversationListViewModel.filterConversations`
 * (`:583-637`). Le point qui gouverne tout ce fichier : **une conversation
 * ARCHIVÉE change de CORPUS** (`:598-601`, « sans ce gate, une archivée
 * reparaîtrait dans "Non lus" ») — elle est EXCLUE de `all`/`unread`/
 * `groups`/`directs`/`pinned`, et n'apparaît QUE sous `archived`. La
 * recherche matche le nom AFFICHÉ (`titleOf`, qui porte déjà `customName`
 * depuis #5559 §5-view), jamais un champ brut.
 */
export type ListFilter = 'all' | 'unread' | 'favorites' | 'groups' | 'directs' | 'pinned' | 'archived';

/**
 * Les libellés des puces, dans la langue d'interface (#10593) — mots d'iOS
 * (`conversation.filter.*`). « Favoris » suit « Non lus » : ce sont les deux
 * filtres d'ÉTAT d'iOS (`ConversationFilterComposition.stateFilters`).
 */
const FILTER_LABEL_KEYS: Readonly<Record<ListFilter, RowMenuCatalogKey>> = {
  all: 'listFilter.all',
  unread: 'listFilter.unread',
  favorites: 'listFilter.favorites',
  groups: 'listFilter.groups',
  directs: 'listFilter.directs',
  pinned: 'listFilter.pinned',
  archived: 'listFilter.archived',
};

export const filterLabel = (filter: ListFilter, language: InterfaceLanguage): string => rowMenuText(language, FILTER_LABEL_KEYS[filter]);

export const LIST_FILTERS: readonly ListFilter[] = ['all', 'unread', 'favorites', 'groups', 'directs', 'pinned', 'archived'];

type Overrides = Readonly<Record<string, ConversationOverride>>;

export function applyFilter(params: {
  readonly conversations: readonly Conversation[];
  readonly filter: ListFilter;
  readonly search: string;
  readonly viewerId: string;
  readonly overrides: Overrides;
}): readonly Conversation[] {
  const { conversations, filter, search, viewerId, overrides } = params;
  const query = search.trim().toLowerCase();

  const searched =
    query.length === 0
      ? conversations
      : conversations.filter((c) => titleOf(c, viewerId).toLowerCase().includes(query));

  if (filter === 'archived') {
    return searched.filter((c) => effectiveFlagsOf(c, overrides).isArchived);
  }

  // Précédence iOS `:598-601` : une conversation archivée n'apparaît QUE sous
  // l'onglet `archived`, jamais mélangée aux autres corpus.
  const nonArchived = searched.filter((c) => !effectiveFlagsOf(c, overrides).isArchived);

  switch (filter) {
    case 'all':
      return nonArchived;
    case 'unread':
      return nonArchived.filter((c) => effectiveUnreadOf(c, overrides) > 0);
    // `.favoris` d'iOS (`ConversationListViewModel.swift:617`) : un emoji posé.
    case 'favorites':
      return nonArchived.filter((c) => reactionOf(c) !== undefined);
    case 'groups':
      return nonArchived.filter((c) => isGroup(c));
    case 'directs':
      return nonArchived.filter((c) => !isGroup(c));
    case 'pinned':
      return nonArchived.filter((c) => effectiveFlagsOf(c, overrides).isPinned);
  }
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
