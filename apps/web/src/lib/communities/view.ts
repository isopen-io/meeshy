import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import type { InfiniteData } from '@tanstack/react-query';

import { searchTermOf, type CommunityConversation, type CommunityPage, type CommunitySummary } from '@/lib/api/communities';

/**
 * **LES RÈGLES PURES DES ÉCRANS DE COMMUNAUTÉ** (#6364) — ce que la liste, la
 * carte, le détail et la création affichent, sans DOM ni requête.
 */

export { compactCount } from '@/lib/view/compact-count';

/**
 * La teinte d'une communauté — miroir `APICommunity.toCommunity()`, qui la
 * dérive de son NOM par `DynamicColorGenerator.colorForName`. Même fonction,
 * même palette que la passerelle et Android (`@meeshy/shared`) : une même
 * communauté porte la même couleur sur les trois plateformes.
 */
export function communityAccent(name: string): string {
  return colorForName(name);
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

export type MembershipAction = 'join' | 'leave' | 'none';

/**
 * **LE GESTE D'ADHÉSION QUE LE DÉTAIL OFFRE** (#6378) — miroir
 * `CommunityDetailView.actionsSection` : « Rejoindre » à un non-membre d'une
 * communauté PUBLIQUE (une privée ne s'ouvre que sur invitation, la passerelle
 * rendrait 403), « Quitter » à un membre qui ne l'a pas créée (la passerelle
 * refuse le départ du créateur), rien sinon — et rien tant que le rôle du
 * lecteur n'est pas SERVI : un bouton deviné serait un contrôle qui ment.
 */
export function membershipActionOf(community: CommunitySummary, viewerId: string | null): MembershipAction {
  if (viewerId === null || community.viewerRole === undefined) return 'none';
  if (community.createdBy === viewerId) return 'none';
  if (community.viewerRole === null) return community.isPrivate ? 'none' : 'join';
  return 'leave';
}

/** Qui peut inviter (#6376) — la règle de `POST /communities/:id/invite` : un membre invite ; dans une communauté privée, administrateurs et modérateurs seulement. */
export function canInviteOf(community: CommunitySummary): boolean {
  const role = community.viewerRole;
  if (role === null || role === undefined) return false;
  return !community.isPrivate || role === 'admin' || role === 'moderator';
}
