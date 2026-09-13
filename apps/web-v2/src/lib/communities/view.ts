import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { InfiniteData } from '@tanstack/react-query';

import { searchTermOf, type CommunityConversation, type CommunityPage, type CommunitySummary } from '@/lib/api/communities';

/**
 * **LES RÈGLES PURES DES ÉCRANS DE COMMUNAUTÉ** (#6364) — ce que la liste, la
 * carte, le détail et la création affichent, sans DOM ni requête.
 */

/**
 * L'abrégé d'un compteur — miroir `CompactCountLabel` (iOS), qui l'a sorti de
 * sept copies pour la raison qui vaut ici : `1.3K` n'est pas un nombre en
 * français, qui écrit `1,3 k`. CLDR décide du séparateur ET de l'abréviation.
 */
export function compactCount(count: number, language: string): string {
  return new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(count);
}

/**
 * La teinte d'une communauté — miroir `APICommunity.toCommunity()`, qui la
 * dérive de son NOM par `DynamicColorGenerator.colorForName`. Même fonction,
 * même palette que la passerelle et Android (`@meeshy/shared`) : une même
 * communauté porte la même couleur sur les trois plateformes.
 */
export function communityAccent(name: string): string {
  return colorForName(name);
}

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/u)
    .slice(0, 2)
    .map((word) => [...word][0]?.toUpperCase() ?? '')
    .join('');
}

export function conversationTitleOf(conversation: Pick<CommunityConversation, 'title' | 'identifier'>, untitled: string): string {
  return conversation.title ?? conversation.identifier ?? untitled;
}

/**
 * **LE DÉTAIL SE PEINT DEPUIS LA LISTE** — la carte déjà reçue, cherchée dans
 * toutes les listes en cache (la liste complète et chaque recherche), par id
 * ou par identifiant : l'adresse `/communities/mshy_…` est aussi valable que
 * `/communities/<id>` (`GET /communities/:id` accepte les deux). `undefined`
 * plutôt que `null` : c'est ce que `initialData` lit comme « rien en cache ».
 */
export function findCachedCommunity(
  lists: ReadonlyArray<InfiniteData<CommunityPage, number> | undefined>,
  communityId: string,
): CommunitySummary | undefined {
  return lists
    .flatMap((list) => list?.pages ?? [])
    .flatMap((page) => page.communities)
    .find((community) => community.id === communityId || community.identifier === communityId);
}

/**
 * **LA RECHERCHE SE PEINT DEPUIS LE CACHE** — la liste complète déjà reçue,
 * filtrée comme la passerelle filtre (nom ou identifiant, insensible à la
 * casse), sert de `placeholderData` pendant que la requête part. Taper « clu »
 * montre donc aussitôt « Club de lecture » ; la réponse serveur complète
 * ensuite ce que la première page ne portait pas. iOS, lui, vide la grille le
 * temps de la requête.
 */
export function cachedSearchPlaceholder(
  cached: InfiniteData<CommunityPage, number> | undefined,
  search: string,
): InfiniteData<CommunityPage, number> | undefined {
  const term = searchTermOf(search).toLowerCase();
  if (term === '' || cached === undefined) return undefined;
  const communities = cached.pages
    .flatMap((page) => page.communities)
    .filter((community) => community.name.toLowerCase().includes(term) || community.identifier.toLowerCase().includes(term));
  return { pages: [{ communities, nextOffset: null }], pageParams: [0] };
}
