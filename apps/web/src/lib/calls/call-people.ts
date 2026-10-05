import type { PersonSummary } from '@/lib/api/friend-requests';
import { candidatesFor } from '@/lib/conversation-new/candidates';

import type { DecodedPerson } from './call-decode';

/**
 * **QUI L'ON PEUT AJOUTER À UN APPEL** (#8433) — ses contacts acceptés (la
 * passerelle refuse tout autre invité : `NOT_A_CONTACT`), moins celles et ceux
 * déjà dans l'appel ou qui y sonnent. La recherche est celle de « Nouvelle
 * conversation » (`candidatesFor`), sans accents ni casse.
 */
export function invitableFriends(params: {
  readonly friends: readonly PersonSummary[];
  readonly inCall: readonly string[];
  readonly query: string;
}): readonly PersonSummary[] {
  const present = new Set(params.inCall);
  const open = params.friends.filter((friend) => !present.has(friend.id));
  return candidatesFor({ friends: open, query: params.query, searchResults: undefined, viewerId: null }).friends;
}

export const personOf = (person: PersonSummary): DecodedPerson => ({ userId: person.id, name: person.displayName ?? person.username, avatar: person.avatar });
