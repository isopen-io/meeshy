package me.meeshy.app.chat

/**
 * The sealed set of per-message "fiches" (detail sheets) the chat can open. Exactly one is
 * active at a time: opening a route replaces the current one. Pure and JVM-testable; the
 * [encode]/[decode] pair lets the host keep the route across a configuration change.
 */
sealed interface MessageDetailRoute {
    val messageId: String
    val tag: String

    data class Views(override val messageId: String) : MessageDetailRoute { override val tag get() = "views" }
    data class Reactions(override val messageId: String) : MessageDetailRoute { override val tag get() = "reactions" }
    data class Languages(override val messageId: String) : MessageDetailRoute { override val tag get() = "languages" }
    data class History(override val messageId: String) : MessageDetailRoute { override val tag get() = "history" }
    data class Sentiment(override val messageId: String) : MessageDetailRoute { override val tag get() = "sentiment" }
    data class Report(override val messageId: String) : MessageDetailRoute { override val tag get() = "report" }
    data class CallDetails(override val messageId: String) : MessageDetailRoute { override val tag get() = "call" }
    data class Map(override val messageId: String) : MessageDetailRoute { override val tag get() = "map" }

    fun encode(): String = "$tag|$messageId"

    companion object {
        fun decode(raw: String?): MessageDetailRoute? {
            val parts = raw?.split('|', limit = 2) ?: return null
            val id = parts.getOrNull(1)?.takeIf { it.isNotBlank() } ?: return null
            return when (parts[0]) {
                "views" -> Views(id)
                "reactions" -> Reactions(id)
                "languages" -> Languages(id)
                "history" -> History(id)
                "sentiment" -> Sentiment(id)
                "report" -> Report(id)
                "call" -> CallDetails(id)
                "map" -> Map(id)
                else -> null
            }
        }
    }
}

/** Single-active-route transitions. */
object MessageDetailRoutes {
    /** Opening replaces whatever was open. */
    fun open(@Suppress("UNUSED_PARAMETER") current: MessageDetailRoute?, next: MessageDetailRoute): MessageDetailRoute = next

    /** Closing always yields no route. */
    fun close(@Suppress("UNUSED_PARAMETER") current: MessageDetailRoute?): MessageDetailRoute? = null

    /** Closing a specific route only clears it if it is still the active one (a stale dismiss is ignored). */
    fun closeIf(current: MessageDetailRoute?, route: MessageDetailRoute): MessageDetailRoute? =
        if (current == route) null else current

    /** The route implied by the chat state's own sheets, in priority order; first non-null wins. */
    fun fromChatState(
        reportMessageId: String?,
        languagesMessageId: String?,
        reactionsMessageId: String?,
    ): MessageDetailRoute? =
        reportMessageId?.let { MessageDetailRoute.Report(it) }
            ?: languagesMessageId?.let { MessageDetailRoute.Languages(it) }
            ?: reactionsMessageId?.let { MessageDetailRoute.Reactions(it) }
}
