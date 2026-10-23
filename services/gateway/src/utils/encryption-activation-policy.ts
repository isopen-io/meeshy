import { isGlobalAdmin } from '@meeshy/shared/types/role-types';

/**
 * **Qui peut activer le chiffrement d'une conversation — politique UNIQUE (#12517).**
 *
 * Directive porteur du 2026-10-23 : tant que le chiffrement de bout en bout
 * n'est pas opérationnel (libsignal, milestone « Chiffrement de bout en bout
 * vérifiable »), seule une personne de rôle de PLATEFORME `ADMIN` ou `BIGBOSS`
 * active le chiffrement, quel qu'en soit le mode. Une conversation activée par
 * un utilisateur ordinaire devenait muette pour le texte et ne revenait plus
 * en arrière.
 *
 * Cette politique s'AJOUTE aux règles d'appartenance et de rang de la route :
 * un administrateur de la plateforme étranger à la conversation reste
 * étranger. La relâcher se fait ICI, et nulle part ailleurs ; son miroir iOS
 * est `ConversationEncryptionActivationPolicy`.
 *
 * Fermée par défaut : un rôle absent ou illisible n'accorde rien.
 */
export const ENCRYPTION_ACTIVATION_POLICY = 'platform-admins-only' as const;

export const ENCRYPTION_ACTIVATION_RESTRICTED_CODE = 'ENCRYPTION_ACTIVATION_RESTRICTED' as const;

export type EncryptionActivationActor = {
  readonly platformRole?: string | null;
};

export function mayActivateConversationEncryption(actor: EncryptionActivationActor): boolean {
  return isGlobalAdmin(actor.platformRole ?? '');
}
