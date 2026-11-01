package me.meeshy.sdk.model.mention

/** Le `contextType` de `GET /mentions/suggestions` : un post couvre aussi story, réel et humeur. */
enum class MentionContextType(val wire: String) {
    CONVERSATION("conversation"),
    POST("post"),
}

/**
 * Le contexte d'une saisie « @ » (#14053) : ce que la passerelle lit pour faire remonter les
 * personnes du contexte, et ce qui dit au cache local s'il peut proposer un contact hors du
 * contexte. [membersOnly] reprend `mentionableScope` de la passerelle : une conversation directe
 * ou un groupe ne se mentionne qu'entre membres ; un type inconnu échoue fermé.
 */
data class MentionContext(
    val id: String,
    val type: MentionContextType,
    val membersOnly: Boolean = false,
) {
    companion object {
        private val OPEN_CONVERSATION_TYPES = setOf("public", "global", "broadcast")

        fun conversation(id: String?, conversationType: String?): MentionContext? {
            val key = id?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val open = conversationType?.trim()?.lowercase() in OPEN_CONVERSATION_TYPES
            return MentionContext(key, MentionContextType.CONVERSATION, membersOnly = !open)
        }

        fun post(id: String?): MentionContext? {
            val key = id?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return MentionContext(key, MentionContextType.POST)
        }
    }
}
