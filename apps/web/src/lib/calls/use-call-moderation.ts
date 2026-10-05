import { useInfiniteQuery } from '@tanstack/react-query';

import { conversationMembersQueryOptions, flattenConversationMembers } from '@/lib/api/conversation-members';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { callActions } from './call-actions';
import { callNoticeStore, showNotice } from './call-control-state';
import { callRoles, mayModerateInCall, removeFromCall, type CallModeration } from './call-moderation';
import type { ActiveCall } from './call-store';

/**
 * Les gestes de modération d'un appel rejoint (#3721, #8438), en duo comme en
 * groupe : « Couper le micro » (socket, par le moteur) et « Retirer de
 * l'appel » (`DELETE /calls/:callId/participants/:participantId`). Qui les voit
 * suit `mayModerateInCall` — l'initiateur de l'appel, ou un modérateur de la
 * conversation au-dessus de la cible ; les rangs viennent de la liste des
 * membres (la même requête, donc le même cache, que la fiche de la
 * conversation). `null` hors d'un appel rejoint. Le client est passé
 * explicitement : l'écran d'appel se monte aussi hors de tout fournisseur.
 */
export function useCallModeration(call: Pick<ActiveCall, 'callId' | 'conversationId' | 'phase' | 'initiatorId' | 'members'>): CallModeration | null {
  const live = call.phase.kind === 'connected' || call.phase.kind === 'reconnecting';
  const query = useInfiniteQuery({ ...conversationMembersQueryOptions(apiDeps, call.conversationId), enabled: live && apiDeps.source !== 'fixtures' }, appQueryClient);
  const callId = call.callId;
  if (!live || callId === null) return null;
  const roles = callRoles(flattenConversationMembers(query.data));
  const viewerId = resolveViewer({ source: apiDeps.source, session: sessionStore.getState().session }).id;
  const context = { viewerId, initiatorId: call.initiatorId, roles };
  return {
    canModerate: (userId) => {
      const member = call.members[userId];
      return member !== undefined && member.link !== 'ringing' && mayModerateInCall(context, userId);
    },
    mute: (userId) => callActions.muteParticipant(userId),
    remove: (userId) => {
      const name = call.members[userId]?.name ?? '';
      void removeFromCall(apiDeps, { callId, userId })
        .catch(() => false)
        .then((removed) => {
          if (!removed) showNotice(callNoticeStore, { kind: 'remove-failed', name });
        });
    },
  };
}
