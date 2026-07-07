package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationContext
import me.meeshy.sdk.theme.DynamicColorGenerator.ConversationType

/** Deterministic accent color (hex) for a conversation, via the shared color algorithm. */
fun ApiConversation.accentHex(): String {
    val context = ConversationContext(
        name = title ?: identifier ?: id,
        type = when (type.lowercase()) {
            "group" -> ConversationType.GROUP
            "community" -> ConversationType.COMMUNITY
            "channel" -> ConversationType.CHANNEL
            "bot" -> ConversationType.BOT
            else -> ConversationType.DIRECT
        },
        memberCount = memberCount,
    )
    return DynamicColorGenerator.colorFor(context).primary
}

private val directConversationTypes = setOf("direct", "dm")

/**
 * The name to show for a conversation. A group/community keeps its [title]; a direct
 * conversation has no title, so — like iOS `APIConversation.toConversation` — it
 * resolves the OTHER participant's name (excluding [currentUserId]) instead of the
 * bare "Conversation" fallback.
 */
fun ApiConversation.displayTitle(currentUserId: String? = null): String {
    title?.takeIf { it.isNotBlank() }?.let { return it }
    preferences?.customName?.takeIf { it.isNotBlank() }?.let { return it }
    if (type.lowercase() in directConversationTypes) {
        otherParticipantName(currentUserId)?.let { return it }
    }
    return "Conversation"
}

private fun ApiConversation.otherParticipantName(currentUserId: String?): String? {
    val other = participants.firstOrNull { it.userId != null && it.userId != currentUserId }
    return other?.displayName?.takeIf { it.isNotBlank() }
        ?: other?.username?.takeIf { it.isNotBlank() }
}
