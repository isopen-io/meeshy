package me.meeshy.sdk.model

/**
 * La garde fail-closed du chiffrement de bout en bout pour ce qui s'écrit sur le disque.
 *
 * Deux règles, une seule source :
 * 1. un fil chiffré n'accepte JAMAIS un message en clair — ni de l'écho socket, ni d'une page
 *    REST, ni d'une bulle optimiste : ce qui n'est pas marqué chiffré y est refusé, sans repli ;
 * 2. un message chiffré ne laisse aucun texte requêtable : la colonne de recherche ne porte
 *    jamais son cryptogramme ni une traduction marquée chiffrée.
 *
 * Miroir de la règle iOS « un message en clair dans une conversation chiffrée est refusé ».
 */
public object MessageEncryptionGuard {

    public sealed interface Verdict {
        public data object Admitted : Verdict

        public data class Refused(val reason: Reason) : Verdict
    }

    public enum class Reason { PLAINTEXT_IN_ENCRYPTED_THREAD }

    /** Un fil chiffré n'admet qu'un message déclaré chiffré, ou sans texte (média, avis système). */
    public fun verdict(threadEncrypted: Boolean, message: ApiMessage): Verdict =
        if (threadEncrypted && message.isEncrypted != true && message.content.isNotEmpty()) {
            Verdict.Refused(Reason.PLAINTEXT_IN_ENCRYPTED_THREAD)
        } else {
            Verdict.Admitted
        }

    /**
     * Le texte que la recherche locale peut indexer ; `null` pour un message chiffré, sans texte,
     * supprimé, éphémère, à vue unique ou flouté : ce qu'on masque à l'écran ne s'indexe jamais en clair.
     */
    public fun searchableText(message: ApiMessage): String? =
        message.content.takeIf {
            it.isNotBlank() &&
                message.isEncrypted != true &&
                message.deletedAt == null &&
                message.expiresAt.isNullOrBlank() &&
                message.isViewOnce != true &&
                message.isBlurred != true &&
                ((message.effectFlags?.toLong() ?: 0L) and AttachmentProtection.MASKING_FLAGS) == 0L
        }
}
