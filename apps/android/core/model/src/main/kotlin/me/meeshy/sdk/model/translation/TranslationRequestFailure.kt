package me.meeshy.sdk.model.translation

/**
 * L'échec d'une demande de traduction, publié sur la ligne de la langue demandée : la feuille
 * quitte son état « en cours » et dit pourquoi. Miroir de `ConversationTranslationRequestFailure`
 * (iOS, `ConversationViewModelTypes.swift`).
 */
public data class TranslationRequestFailure(
    val messageId: String,
    val language: String,
    val kind: Kind,
    val reason: Reason,
    /** Le message du serveur ou du réseau quand il existe ; jamais un contenu de message. */
    val detail: String? = null,
) {
    public enum class Kind { TEXT, AUDIO }

    public enum class Reason {
        /** Chiffrée de bout en bout : la traduction passe par l'appareil, jamais par le serveur. */
        SERVER_REFUSED,

        /** La demande est partie et n'a rien rendu (réseau, serveur, consentement). */
        FAILED,
    }

    /** La clé de la ligne : `messageId|language`, la même que celle de l'indicateur « en cours ». */
    public val rowKey: String get() = rowKey(messageId, language)

    public companion object {
        public fun rowKey(messageId: String, language: String): String = "$messageId|$language"

        public fun serverRefused(messageId: String, language: String, kind: Kind): TranslationRequestFailure =
            TranslationRequestFailure(messageId, language, kind, Reason.SERVER_REFUSED)
    }
}
