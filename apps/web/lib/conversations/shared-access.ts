import { isExpired } from '@/utils/time-remaining';
import type { LinkConversationData } from '@/services/link-conversation.service';

/**
 * Décision de rendu pour `/chat/:sharedId`.
 *
 * Le point clé : c'est une DÉCISION DE RENDU, jamais une navigation. L'ancienne
 * paire `/chat/[id]` + `/join/[linkId]` se renvoyait la balle par `router.push`
 * et finissait en boucle (trois gardes `sessionStorage` avaient été empilées
 * pour la contenir). Ici, un seul écran décide quoi peindre : la vue complète,
 * la vue partagée vivante, ou l'aperçu + modale.
 */
export type SharedAccessErrorReason = 'invalid' | 'inactive' | 'expired';

export type SharedConversationAccess =
  | { state: 'error'; reason: SharedAccessErrorReason }
  /** Membre de la conversation → vue applicative complète. */
  | { state: 'member'; conversationId: string }
  /** Participant anonyme déjà inscrit sur ce lien → vue partagée vivante. */
  | { state: 'participant'; conversationId: string }
  /** Doit encore rejoindre → aperçu + modale. */
  | { state: 'visitor'; conversationId: string; identity: 'none' | 'registered' };

export type ResolveSharedAccessInput = {
  data: LinkConversationData | null | undefined;
  nowMs?: number;
};

export function resolveSharedAccess({
  data,
  nowMs = Date.now(),
}: ResolveSharedAccessInput): SharedConversationAccess {
  if (!data?.conversation?.id || !data.link) {
    return { state: 'error', reason: 'invalid' };
  }

  const conversationId = data.conversation.id;

  // Un membre passe avant toute vérification de validité du lien : le lien sert
  // à ENTRER dans la conversation, pas à y rester. Un lien expiré ne peut pas
  // éjecter quelqu'un de sa propre conversation.
  if (data.userType === 'member') {
    return { state: 'member', conversationId };
  }

  if (!data.link.isActive) {
    return { state: 'error', reason: 'inactive' };
  }

  if (isExpired(data.link.expiresAt, nowMs)) {
    return { state: 'error', reason: 'expired' };
  }

  const currentUser = data.currentUser;

  if (currentUser && currentUser.isMeeshyer === false) {
    return { state: 'participant', conversationId };
  }

  return {
    state: 'visitor',
    conversationId,
    identity: currentUser?.isMeeshyer ? 'registered' : 'none',
  };
}
