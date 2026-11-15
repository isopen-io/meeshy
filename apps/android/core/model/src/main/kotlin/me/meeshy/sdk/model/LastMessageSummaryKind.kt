package me.meeshy.sdk.model

/**
 * Comment résumer le dernier message d'une ligne de liste — UNE seule énumération (miroir de
 * `LastMessageSummaryKind.swift`), partagée par la liste et la recherche.
 *
 * Ordre de décision, le premier qui correspond gagne : expiré, chiffré (bras Android), flou,
 * vue unique, après lecture (flamme-œil), éphémère actif, sinon standard.
 */
enum class LastMessageSummaryKind {
    /** Contenu affichable normalement (texte / pièces jointes). */
    STANDARD,

    /** Message flouté : le contenu ne doit pas être exposé. */
    HIDDEN,

    /** Message à vue unique : le contenu ne doit pas être exposé. */
    VIEW_ONCE,

    /** Flamme-œil : disparaît quand son lecteur l'a VU ; le lire en liste ne le consommerait pas. */
    AFTER_READ,

    /** Message éphémère dont l'échéance est dépassée. */
    EXPIRED,

    /** Message éphémère encore lisible (échéance future). */
    EPHEMERAL_ACTIVE,

    /** Message de bout en bout que l'app native n'ouvre pas encore : aucun texte servi. */
    ENCRYPTED,
    ;

    companion object {
        fun of(message: ApiConversationLastMessage?, nowMillis: Long): LastMessageSummaryKind {
            if (message == null) return STANDARD
            val expiresAt = isoToEpochMillisOrNull(message.expiresAt)
            if (expiresAt != null && expiresAt <= nowMillis) return EXPIRED
            if (message.isEncrypted == true) return ENCRYPTED
            if (message.isBlurred) return HIDDEN
            if (message.isViewOnce) return VIEW_ONCE
            val flags = (message.effectFlags ?: 0).toLong() and 0xFFFFFFFFL
            if (flags and MessageEffectFlags.EPHEMERAL_AFTER_READ != 0L) return AFTER_READ
            if (expiresAt != null) return EPHEMERAL_ACTIVE
            return STANDARD
        }
    }
}
