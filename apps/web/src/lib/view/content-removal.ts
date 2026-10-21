import { platformModerates } from '@meeshy/shared/utils/message-action-policy';

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

/** Rôle de plateforme MODERATOR, ADMIN ou BIGBOSS, comparé EXACTEMENT (`platformModerates`, `@meeshy/shared`). Le retrait d'un MESSAGE se lit sur `verdicts.remove` (`messageActionsOf`). */
export const moderatesPlatformContent = (platformRole: string | null | undefined): boolean =>
  platformModerates({
    id: '',
    hasAccount: true,
    isAnonymous: false,
    platformRole: platformRole ?? null,
    conversationRole: null,
    canSendMessages: true,
    isActiveMember: true,
    isDeclaredMinor: false,
  });
