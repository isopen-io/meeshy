import type { QueryClient } from '@tanstack/react-query';
import type { ConversationViewerCapabilities } from '@meeshy/shared/types/conversation-viewer-capabilities';

import { conversationQueryKey, patchConversation, patchConversationDetail } from './conversations';
import type { Conversation } from './types';

/**
 * LE RANG DU LECTEUR CHANGE, SES GESTES SUIVENT (#15987) —
 * `participant:role-updated` qui nomme le lecteur lui remet, depuis la
 * passerelle de ce lot, sa capacité recalculée (`viewerCapabilities`, #14690) :
 * la liste et le détail la prennent avec le nouveau rang. Absente ou illisible
 * (serveur antérieur, lecture impossible), la capacité de l'ancien rang
 * s'efface — la règle locale reprend — et le détail se relit, qui la sert.
 *
 * Site UNIQUE : la connexion temps réel l'écoute toujours, la feuille des
 * membres l'applique aussi quand elle est ouverte ; les deux convergent.
 */
export type ViewerRoleUpdate = {
  readonly conversationId: string;
  readonly role: string;
  readonly capabilities: ConversationViewerCapabilities | null;
};

type Payload = Readonly<Record<string, unknown>>;

const textOf = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const capabilitiesOf = (value: unknown): ConversationViewerCapabilities | null => {
  if (typeof value !== 'object' || value === null) return null;
  const canMakeObsolete = (value as Payload).canMakeObsolete;
  return typeof canMakeObsolete === 'boolean' ? { canMakeObsolete } : null;
};

export function viewerRoleUpdateOf(value: unknown, viewerId: string): ViewerRoleUpdate | null {
  if (typeof value !== 'object' || value === null) return null;
  const payload = value as Payload;
  const conversationId = textOf(payload.conversationId);
  const role = textOf(payload.newRole);
  if (conversationId === null || role === null || viewerId === '' || payload.userId !== viewerId) return null;
  return { conversationId, role: role.toLowerCase(), capabilities: capabilitiesOf(payload.viewerCapabilities) };
}

const withViewerRole = (update: ViewerRoleUpdate) => (conversation: Conversation): Conversation => {
  const { viewerCapabilities: _stale, ...rest } = conversation;
  return update.capabilities === null
    ? { ...rest, currentUserRole: update.role }
    : { ...rest, currentUserRole: update.role, viewerCapabilities: update.capabilities };
};

export function applyViewerRoleUpdate(queryClient: QueryClient, update: ViewerRoleUpdate): void {
  patchConversation(queryClient, update.conversationId, withViewerRole(update));
  patchConversationDetail(queryClient, update.conversationId, withViewerRole(update));
  if (update.capabilities === null) {
    void queryClient.invalidateQueries({ queryKey: conversationQueryKey(update.conversationId), exact: true });
  }
}

export const viewerRoleUpdatedListener =
  (queryClient: QueryClient, viewerId: () => string) =>
  (payload: unknown): void => {
    const update = viewerRoleUpdateOf(payload, viewerId());
    if (update !== null) applyViewerRoleUpdate(queryClient, update);
  };
