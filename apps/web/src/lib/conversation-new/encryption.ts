import {
  creationEncryptionOffer,
  type CreationEncryptionMode,
  type CreationEncryptionOffer,
  type CreationEncryptionUnavailability,
} from '@meeshy/shared/utils/conversation-creation-encryption';

import type { ConversationEncryptionCatalogKey } from '@/lib/i18n-conversation-encryption-catalog';

/**
 * **LE CHIFFREMENT SE CHOISIT À LA CRÉATION** (décision du 2026-11-01,
 * `packages/shared/decisions/2026-11-01-le-mode-de-chiffrement-se-choisit-a-la-creation.md`).
 *
 * La loi est UNE, partagée (`creationEncryptionOffer`, miroirs iOS et Android) ;
 * ce module ne fait que dire ce que le web en est : il ne lit ni n'écrit encore
 * le bout en bout (`fact.webCannotReadYet`, `lib/write-restriction.ts`). Le
 * bout en bout n'y est donc jamais disponible — un ANALYST le voit « bientôt »,
 * un rôle inférieur ne le voit pas — et le défaut reste Serveur partout.
 *
 * Seul l'écran de création choisit un mode : les autres créations (profil,
 * partage, carte de contact, clavier d'appel, humeur, réponse depuis une
 * notification) n'en envoient aucun, la passerelle pose Serveur.
 */

/** Le web ne sait pas encore lire ni écrire une conversation chiffrée de bout en bout (#10788). */
export const WEB_END_TO_END_SUPPORTED = false;

export function webCreationEncryptionOffer(params: {
  readonly platformRole: string | null;
  readonly conversationType: 'direct' | 'group';
}): CreationEncryptionOffer {
  return creationEncryptionOffer({
    platformRole: params.platformRole,
    conversationType: params.conversationType,
    endToEndSupported: WEB_END_TO_END_SUPPORTED,
  });
}

/**
 * Le mode qui PART : celui que l'utilisateur a touché s'il est offert ET
 * disponible, sinon le défaut. Un choix fait en direct survit au passage en
 * groupe tant qu'il y reste disponible ; un rôle servi après le premier rendu ne
 * peut pas laisser partir un mode grisé.
 */
export function chosenCreationMode(offer: CreationEncryptionOffer, picked: CreationEncryptionMode | null): CreationEncryptionMode {
  if (picked === null) return offer.defaultMode;
  const choice = offer.choices.find((candidate) => candidate.mode === picked);
  return choice?.available === true ? picked : offer.defaultMode;
}

/** Les mots du choix (`catalog-conversation-encryption-*.ts`, le français porte ceux de la décision). */
export const CREATION_ENCRYPTION_KEY = {
  server: { title: 'conversationEncryption.creation.server.title', detail: 'conversationEncryption.creation.server.detail' },
  hybrid: { title: 'conversationEncryption.creation.hybrid.title', detail: 'conversationEncryption.creation.hybrid.detail' },
  e2ee: { title: 'conversationEncryption.creation.endToEnd.title', detail: null },
} as const satisfies Record<
  CreationEncryptionMode,
  { readonly title: ConversationEncryptionCatalogKey; readonly detail: ConversationEncryptionCatalogKey | null }
>;

export const CREATION_UNAVAILABILITY_KEY = {
  'groups-not-yet': 'conversationEncryption.creation.unavailable.groupsNotYet',
  'client-not-yet': 'conversationEncryption.creation.unavailable.clientNotYet',
} as const satisfies Record<CreationEncryptionUnavailability, ConversationEncryptionCatalogKey>;
