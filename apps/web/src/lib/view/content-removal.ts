import { hasMinimumMemberRole, MemberRole } from '@meeshy/shared/types/role-types';

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

const PLATFORM_MODERATOR_ROLES: ReadonlySet<string> = new Set(['MODERATOR', 'ADMIN', 'BIGBOSS']);

const MODERATED_CONVERSATION_TYPES: ReadonlySet<string> = new Set(['group', 'public', 'global', 'broadcast']);

export const moderatesPlatformContent = (platformRole: string | null | undefined): boolean => PLATFORM_MODERATOR_ROLES.has(platformRole ?? '');

export function moderatesConversation(params: {
  readonly conversation: { readonly type: string; readonly currentUserRole?: string | null | undefined };
  readonly platformRole: string | null | undefined;
}): boolean {
  const { conversation, platformRole } = params;
  if (!MODERATED_CONVERSATION_TYPES.has(conversation.type)) return false;
  return hasMinimumMemberRole(conversation.currentUserRole ?? '', MemberRole.MODERATOR) || moderatesPlatformContent(platformRole);
}
