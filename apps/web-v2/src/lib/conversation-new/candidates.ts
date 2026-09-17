import type { FriendRequestRecord, PersonSummary } from '@/lib/api/friend-requests';

/**
 * LES AMIS D'ABORD (#6705) — ce que « Nouvelle conversation » propose, miroir
 * de `NewConversationViewModel` (`apps/ios/.../NewConversationViewModel.swift`),
 * qui montre ses contacts avant toute frappe.
 *
 * Les amitiés acceptées arrivent du cache PERSISTÉ de TanStack Query
 * (`api/query-client.ts`, restauré avant le premier rendu) : l'écran peint ses
 * amis sans attendre le réseau dès qu'un écran les a déjà chargés, puis la
 * revalidation les remplace. La recherche globale (`/directory/people`) ne vient
 * qu'EN PLUS, pour ce que les amis ne contiennent pas.
 *
 * **Le lecteur n'est jamais proposé.** La passerelle refuse une conversation
 * directe avec soi-même (400, `routes/conversations/core-lifecycle.ts`) : le
 * proposer, c'est offrir un geste qui échoue. Sans lecteur connu, on ne sait pas
 * qui est « l'autre » d'une amitié — rien n'est proposé plutôt que soi.
 */

export type NewConversationCandidates = {
  readonly friends: readonly PersonSummary[];
  readonly others: readonly PersonSummary[];
};

const foldForSearch = (text: string): string =>
  text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr');

const sortKeyOf = (person: PersonSummary): string => foldForSearch(person.displayName ?? person.username);

function counterpartOf(request: FriendRequestRecord, viewerId: string): PersonSummary | null {
  if (request.senderId === viewerId) return request.receiver;
  if (request.receiverId === viewerId) return request.sender;
  return null;
}

export function friendsOf(params: {
  readonly accepted: readonly FriendRequestRecord[];
  readonly viewerId: string | null;
}): readonly PersonSummary[] {
  const { viewerId } = params;
  if (viewerId === null) return [];
  const others = params.accepted.flatMap((request) => {
    const other = counterpartOf(request, viewerId);
    return other === null || other.id === viewerId ? [] : [other];
  });
  const unique = [...new Map(others.map((person) => [person.id, person])).values()];
  return unique.sort((a, b) => sortKeyOf(a).localeCompare(sortKeyOf(b), 'fr'));
}

const matches = (person: PersonSummary, needle: string): boolean =>
  [person.displayName, person.username].some((text) => text !== null && foldForSearch(text).includes(needle));

export function candidatesFor(params: {
  readonly friends: readonly PersonSummary[];
  readonly query: string;
  readonly searchResults: readonly PersonSummary[] | undefined;
  readonly viewerId: string | null;
}): NewConversationCandidates {
  const needle = foldForSearch(params.query.trim());
  if (needle === '') return { friends: params.friends, others: [] };
  const friendIds = new Set(params.friends.map((person) => person.id));
  return {
    friends: params.friends.filter((person) => matches(person, needle)),
    others: (params.searchResults ?? []).filter((person) => person.id !== params.viewerId && !friendIds.has(person.id)),
  };
}
