import type { Message } from '@/lib/api/types';
import { sharedTranslationServerReadsMessage } from '@meeshy/shared/utils/shared-translation-eligibility';

/**
 * UN MESSAGE QUE LE SERVEUR NE LIT PAS EST SCELLÉ POUR LE WEB (#12983).
 *
 * Le web ne détient aucune clé libsignal (#10788, décision #12975) : il ne
 * reçoit aucune enveloppe, et la passerelle ne lui sert que le littéral
 * `[Encrypted]`. La loi est celle que l'aperçu d'appui long, la traduction sur
 * l'appareil et la passerelle appliquent déjà
 * (`sharedTranslationServerReadsMessage`) : seuls un message en clair et un
 * message chiffré PAR le serveur (`server`, `hybrid`) se lisent. Bout en bout,
 * mode inconnu ou chiffré sans mode : scellé, on ne devine pas un clair. Le
 * mode de la conversation reste hors de la question, comme côté passerelle :
 * un message en clair antérieur au chiffrement reste lisible.
 *
 * Le jour où le web aura sa pile, ce verdict cédera la place à la provenance
 * du clair déchiffré sur l'appareil, jamais à la forme du texte.
 */
export const endToEndSealed = (message: Pick<Message, 'isEncrypted' | 'encryptionMode'>): boolean =>
  message.isEncrypted === true &&
  !sharedTranslationServerReadsMessage({
    conversationEncryptionMode: null,
    messageIsEncrypted: message.isEncrypted,
    messageEncryptionMode: message.encryptionMode,
  });
