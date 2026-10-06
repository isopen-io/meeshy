import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { flattenFriendRequests, friendRequestsQueryOptions } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { friendsOf } from '@/lib/conversation-new/candidates';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

import type { DuoFriend } from '@/components/game-duo';

/**
 * LES AMIS DU JEU (#9385) — ce que la ligue Amis et le duo ont besoin de savoir
 * d'eux : le NOM (le classement entre amis nomme des personnes, la ligue
 * publique, jamais) et de quoi les inviter.
 *
 * Ils viennent des amitiés ACCEPTÉES, du cache persisté de TanStack Query :
 * l'écran se peint sans attendre le réseau dès qu'un écran les a chargées. Une
 * personne sans nom d'affichage se nomme par son pseudo, jamais par un
 * identifiant.
 */
export type GameFriends = {
  readonly friends: readonly DuoFriend[];
  readonly names: ReadonlyMap<string, string>;
};

/** L'identifiant du lecteur, `null` sans session — la clé des mémoires par appareil (`game-guide/memory.ts`). */
export function useViewerId(): string | null {
  const session = useStore(sessionStore, (state) => state.session);
  return resolveViewer({ source: apiDeps.source, session }).id ?? null;
}

export function useGameFriends(): GameFriends {
  const session = useStore(sessionStore, (state) => state.session);
  const enabled = apiDeps.source === 'fixtures' || session.status === 'authenticated';
  const viewerId = useViewerId();
  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled }, appQueryClient);
  useExhaustPages(accepted, enabled);

  return useMemo(() => {
    const people = friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId });
    const friends = people.map((person) => ({ id: person.id, displayName: person.displayName ?? person.username }));
    return { friends, names: new Map(friends.map((friend) => [friend.id, friend.displayName])) };
  }, [accepted.data, viewerId]);
}
