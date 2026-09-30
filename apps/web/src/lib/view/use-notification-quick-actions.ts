import { useInfiniteQuery } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { performSendRequest, type FriendActionDeps } from '@/lib/api/friend-actions';
import { flattenFriendRequests, friendRequestsQueryOptions, type FriendRequestRecord } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import type { NotificationRecord } from '@/lib/notifications/record';
import type { NotificationQuickAction } from '@/lib/notifications/row-presentation';
import { href, navigate } from '@/routes/route-table';

/**
 * **LES GESTES D'UNE LIGNE DE LA CLOCHE** (#8727, miroir de
 * `NotificationListView` + `FriendshipCache` iOS, #8724) — « Écrire » ouvre
 * (ou crée) la conversation directe, « Se connecter » envoie la demande
 * d'amitié par le flux OPTIMISTE existant (`performSendRequest`) : le bouton
 * dit « Demande envoyée » au geste, et revient si la passerelle refuse.
 *
 * L'amitié et la demande déjà partie se LISENT dans les paniers `accepted` et
 * `sent` — les mêmes entrées de cache que l'onglet « Contacts » : aucun état
 * local ne les double. Ils ne sont lus que si une ligne propose un geste.
 */
export type NotificationQuickActionsView = {
  readonly isFriend: (userId: string) => boolean;
  readonly connectRequested: (userId: string) => boolean;
  readonly perform: (action: NotificationQuickAction, notification: NotificationRecord) => Promise<'done' | 'offline' | 'failed'>;
};

const otherParty = (request: FriendRequestRecord, viewerId: string | null): string =>
  request.senderId === viewerId ? request.receiverId : request.senderId;

export function useNotificationQuickActions({ enabled }: { readonly enabled: boolean }): NotificationQuickActionsView {
  const viewerId = useStore(sessionStore, (state) => (state.session.status === 'authenticated' ? state.session.user.id : null));
  const active = enabled && (apiDeps.source === 'fixtures' || viewerId !== null);
  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled: active, notifyOnChangeProps: ['data'] }, appQueryClient);
  const sent = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'sent'), enabled: active, notifyOnChangeProps: ['data'] }, appQueryClient);

  const friends = useMemo(() => new Set(flattenFriendRequests(accepted.data).map((request) => otherParty(request, viewerId))), [accepted.data, viewerId]);
  const requested = useMemo(
    () => new Set(flattenFriendRequests(sent.data).filter((request) => request.status === 'pending').map((request) => request.receiverId)),
    [sent.data],
  );

  const deps: FriendActionDeps = useMemo(
    () => ({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId: () => viewerId }),
    [viewerId],
  );

  const perform = useCallback(
    async (action: NotificationQuickAction, notification: NotificationRecord): Promise<'done' | 'offline' | 'failed'> => {
      if (!navigator.onLine) return 'offline';
      if (action.kind === 'write') {
        const result = await createDirectConversation(apiDeps, action.userId);
        if (!result.ok) return 'failed';
        navigate(href('thread', { conversation: result.data.id }));
        return 'done';
      }
      const actor = notification.actor;
      if (actor === null) return 'failed';
      return performSendRequest({
        person: { id: actor.id, username: actor.username, displayName: actor.displayName, avatar: actor.avatar },
        deps,
      });
    },
    [deps],
  );

  return {
    isFriend: useCallback((userId: string) => friends.has(userId), [friends]),
    connectRequested: useCallback((userId: string) => requested.has(userId), [requested]),
    perform,
  };
}
