import { platformModerates } from '@meeshy/shared/utils/message-action-policy';

import { messageActionsOf, type ActionMessage, type MenuViewer } from './message-action-scope';

/**
 * **RETIRER LE CONTENU D'UN AUTRE** (#11150) — la loi du client, reflet du
 * contrat de la passerelle (issue sœur du milestone « Un administrateur retire
 * le contenu d'un autre et l'auteur sait pourquoi »).
 *
 * - Un MESSAGE d'un autre se retire dans un groupe, une conversation publique,
 *   globale ou de diffusion — jamais en direct — par son créateur, un
 *   administrateur ou un modérateur de la conversation, ou par un rôle de
 *   plateforme MODERATOR, ADMIN ou BIGBOSS.
 * - Une PUBLICATION (post, réel, story) ou un COMMENTAIRE d'un autre se retire
 *   par un rôle de plateforme MODERATOR, ADMIN ou BIGBOSS.
 * - Le MOTIF est obligatoire : nettoyé, 3 à 500 caractères. L'auteur en est
 *   prévenu (notification `content_removed`).
 *
 * Ceci ne décide que de ce qu'on MONTRE ; la passerelle reste l'autorité
 * (hiérarchie entre rôles comprise) et un refus se défait côté client.
 */
export const MODERATION_REASON_MIN = 3;
export const MODERATION_REASON_MAX = 500;

export function moderationReasonOf(text: string): string | null {
  const reason = text.trim();
  return reason.length >= MODERATION_REASON_MIN && reason.length <= MODERATION_REASON_MAX ? reason : null;
}

export function removalBody(reason: string | undefined): { readonly body?: { readonly reason: string } } {
  return reason === undefined ? {} : { body: { reason } };
}

/** Un lecteur inscrit, membre actif, de ce rôle — la seule forme que la loi partagée juge (`message-action-policy.ts`). */
const memberViewer = (platformRole: string | null | undefined, conversationRole: string | null | undefined): MenuViewer => ({
  id: 'viewer',
  hasAccount: true,
  isAnonymous: false,
  platformRole: platformRole ?? null,
  conversationRole: conversationRole ?? null,
  canSendMessages: true,
  isActiveMember: true,
});

/** Le message d'un AUTRE, vivant — ce que « Retirer » vise. */
const OTHERS_MESSAGE: ActionMessage = { id: 'others-message', senderId: 'author', content: '…', createdAt: new Date(0), isViewOnce: false, isBlurred: false };

/** Rôle de plateforme MODERATOR, ADMIN ou BIGBOSS, comparé EXACTEMENT (`platformModerates`, `@meeshy/shared`). */
export const moderatesPlatformContent = (platformRole: string | null | undefined): boolean =>
  platformModerates({ ...memberViewer(platformRole, null), isDeclaredMinor: false });

/** Le verdict `remove` de `messageActionsFor` sur le message d'un autre — jamais une seconde règle (#11210). */
export function moderatesConversation(params: {
  readonly conversation: { readonly type: string; readonly currentUserRole?: string | null | undefined };
  readonly platformRole: string | null | undefined;
}): boolean {
  const { conversation, platformRole } = params;
  const scope = { viewer: memberViewer(platformRole, conversation.currentUserRole), conversation: { type: conversation.type } };
  return messageActionsOf(OTHERS_MESSAGE, scope, { now: Date.now() }).verdicts.remove !== null;
}
