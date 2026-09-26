import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { CallRemoval } from '@/components/call-grid';
import { conversationMembersQueryOptions, flattenConversationMembers } from '@/lib/api/conversation-members';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { callRoles, canRemoveFromCall, removeFromCall } from './call-moderation';
import type { ActiveCall } from './call-store';

/**
 * Le geste « Retirer de l'appel » d'un appel de groupe connecté : les rangs
 * viennent de la liste des membres de la conversation (la même requête, donc
 * le même cache, que la fiche de la conversation) ; `null` hors groupe. Le
 * client est passé explicitement : l'écran d'appel se monte aussi hors de
 * tout fournisseur (rendu statique des témoins).
 */
export function useCallRemoval(call: Pick<ActiveCall, 'callId' | 'conversationId' | 'isGroup' | 'phase'>): CallRemoval | null {
  const live = call.isGroup && (call.phase.kind === 'connected' || call.phase.kind === 'reconnecting');
  const query = useInfiniteQuery({ ...conversationMembersQueryOptions(apiDeps, call.conversationId), enabled: live && apiDeps.source !== 'fixtures' }, appQueryClient);
  const [failed, setFailed] = useState(false);
  const callId = call.callId;
  if (!live || callId === null) return null;
  const roles = callRoles(flattenConversationMembers(query.data));
  const viewerId = resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id;
  const viewerRole = viewerId === null ? undefined : roles.get(viewerId);
  return {
    canRemove: (userId) => canRemoveFromCall(viewerRole, roles.get(userId)),
    remove: (userId) => {
      setFailed(false);
      void removeFromCall(apiDeps, { callId, userId })
        .then((removed) => setFailed(!removed))
        .catch(() => setFailed(true));
    },
    failed,
  };
}
