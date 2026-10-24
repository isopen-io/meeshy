import { GlobalUserRole, globalRoleLevel } from '@meeshy/shared/types/role-types';

/**
 * **Qui peut activer le chiffrement d'une conversation — politique UNIQUE (#12517, #12588).**
 *
 * Directive porteur du 2026-10-23 : tant que le chiffrement de bout en bout
 * n'est pas opérationnel (libsignal, milestone « Chiffrement de bout en bout
 * vérifiable »), l'activation est réservée à un rôle de PLATEFORME, quel qu'en
 * soit le mode. Une conversation activée par un utilisateur ordinaire devenait
 * muette pour le texte et ne revenait plus en arrière.
 *
 * Rôle minimal : `ANALYST` (directives porteur du 2026-10-24, #12588), donc
 * `ANALYST`, `AUDIT`, `MODERATOR`, `ADMIN` et `BIGBOSS`, la casse repliée.
 * `USER` et `AGENT` restent refusés.
 *
 * Cette politique s'AJOUTE aux règles d'appartenance et de rang de la route :
 * un rôle de plateforme étranger à la conversation reste étranger, et sous
 * `MODERATOR` le rôle de plateforme n'apporte, DANS un groupe, aucun rang de
 * conversation ; `MODERATOR`, `ADMIN` et `BIGBOSS` membres y agissent avec les
 * droits du créateur (`conversation-authority.ts`, #11217). La relâcher se fait ICI, et
 * nulle part ailleurs ; son miroir iOS est `ConversationEncryptionActivationPolicy`.
 *
 * Fermée par défaut : un rôle absent ou illisible vaut le niveau 0
 * (`globalRoleLevel`) et n'accorde rien.
 */
export const ENCRYPTION_ACTIVATION_POLICY = 'platform-analysts-and-above' as const;

export const ENCRYPTION_ACTIVATION_MINIMUM_PLATFORM_ROLE = GlobalUserRole.ANALYST;

export const ENCRYPTION_ACTIVATION_RESTRICTED_CODE = 'ENCRYPTION_ACTIVATION_RESTRICTED' as const;

export type EncryptionActivationActor = {
  readonly platformRole?: string | null;
};

export function mayActivateConversationEncryption(actor: EncryptionActivationActor): boolean {
  return globalRoleLevel(actor.platformRole ?? '') >= globalRoleLevel(ENCRYPTION_ACTIVATION_MINIMUM_PLATFORM_ROLE);
}
