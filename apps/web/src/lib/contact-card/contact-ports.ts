import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';

import { createDirectConversation } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import { performSendRequest, type FriendActionOutcome } from '@/lib/api/friend-actions';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { href, navigate } from '@/routes/route-table';

import type { ContactActionPorts } from './use-contact-actions';

/**
 * LES PORTS RÉELS de la carte de visite (#8101) — la demande d'amitié et le
 * direct EXISTANTS, exactement ceux du profil public
 * (`routes/user-profile-controller.ts`).
 */

const viewerId = (): string | null => {
  const { session } = sessionStore.getState();
  return session.status === 'authenticated' ? session.user.id : null;
};

const personOf = (account: PublicContactAccount) => ({
  id: account.userId,
  username: account.username,
  displayName: account.displayName,
  avatar: account.avatarUrl,
});

export const contactActionPorts: ContactActionPorts = {
  sendRequest: (account) =>
    performSendRequest({
      person: personOf(account),
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine, viewerId },
    }),
  openDirect: async (account): Promise<FriendActionOutcome> => {
    if (!navigator.onLine) return 'offline';
    const result = await createDirectConversation(apiDeps, account.userId);
    if (!result.ok) return 'failed';
    navigate(href('thread', { conversation: result.data.id }));
    return 'done';
  },
};
