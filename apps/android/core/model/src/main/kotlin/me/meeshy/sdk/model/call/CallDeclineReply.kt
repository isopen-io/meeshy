package me.meeshy.sdk.model.call

/**
 * Les quatre réponses rapides du refus d'appel, dans l'ordre de la feuille iOS
 * (`CallDeclineQuickReply`, `CallDeclineReply.swift`). Le texte vient du catalogue de
 * chaînes : cette énumération ne porte que l'identité, jamais la phrase.
 */
enum class CallDeclineQuickReply(val id: String) {
    CallBack("callBack"),
    Meeting("meeting"),
    CantTalk("cantTalk"),
    WriteMe("writeMe"),
}

/** Ce qu'il faut envoyer dans la conversation directe une fois l'appel refusé. */
data class CallDeclineReplyPlan(
    val conversationId: String,
    val content: String,
    val originalLanguage: String?,
)

/**
 * La loi du refus avec message (miroir de `CallDeclineReplyRule`, iOS) : un message ne part que
 * d'un appel entrant encore sonnant, vers une conversation connue, et jamais vide. Le texte est
 * rogné puis borné à [MAX_LENGTH] caractères.
 */
object CallDeclineReplyRule {
    const val MAX_LENGTH: Int = 500

    fun plan(
        isDeclinable: Boolean,
        conversationId: String?,
        text: String,
        originalLanguage: String?,
    ): CallDeclineReplyPlan? {
        if (!isDeclinable) return null
        val destination = conversationId?.takeIf { it.isNotBlank() } ?: return null
        val content = text.trim().take(MAX_LENGTH).takeIf { it.isNotEmpty() } ?: return null
        return CallDeclineReplyPlan(destination, content, originalLanguage)
    }

    /** Le brouillon que le champ libre garde : jamais plus de [MAX_LENGTH] caractères. */
    fun clamp(draft: String): String = draft.take(MAX_LENGTH)

    /** Le bouton « Envoyer et refuser » n'est actif que pour un brouillon non vide. */
    fun canSend(draft: String): Boolean = draft.isNotBlank()
}
