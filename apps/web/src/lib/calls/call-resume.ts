import type { CallSession } from '@/lib/api/call-sessions';

import { callDetailFromSession } from './call-detail';
import type { CallIdentity } from './call-notice';
import type { ActiveCall } from './call-store';
import type { JoinCallRequest } from './engine';

/**
 * **« REPRENDRE L'APPEL »** (#3586, E7) — la règle de la bannière globale :
 * la passerelle (`GET /calls/active`) tient le lecteur pour membre d'un appel
 * VIVANT, et CET onglet n'en porte aucun (rechargement, plantage, coque tuée
 * pendant l'appel). Un appel local vivant a sa propre pastille
 * (`call-overlay.tsx`) : la bannière se tait.
 *
 * Miroir `ActiveCallService` + `CallManager.recoverActiveCall` d'iOS, à une
 * différence près, assumée : iOS rejoint seul au redémarrage ; le web DEMANDE
 * un tap, parce qu'un navigateur ne rend ni micro ni son sans geste — une
 * reprise automatique partirait muette.
 */
export function resumableCall(params: {
  readonly active: CallSession | null;
  readonly local: Pick<ActiveCall, 'phase'> | null;
  readonly viewerId: string;
  readonly identityOf: (conversationId: string) => CallIdentity | undefined;
}): JoinCallRequest | null {
  const { active, local } = params;
  if (active === null || !active.live) return null;
  if (local !== null && local.phase.kind !== 'ended') return null;
  const detail = callDetailFromSession(active, { viewerId: params.viewerId, unknown: '', identity: params.identityOf(active.conversationId) });
  return { conversationId: active.conversationId, callId: active.callId, media: active.media, title: detail.name, avatar: detail.avatar, isGroup: detail.isGroup };
}
