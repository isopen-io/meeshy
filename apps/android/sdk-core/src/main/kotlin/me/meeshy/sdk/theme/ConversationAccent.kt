package me.meeshy.sdk.theme

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
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
    resolvedPreferences?.customName?.takeIf { it.isNotBlank() }?.let { return it }
    otherParticipantName(currentUserId)?.let { return it }
    return "Conversation"
}

/**
 * The other participant in a direct conversation (excluding [currentUserId]) — `null` for a
 * group/community/channel/bot conversation, or when no other participant is known.
 */
private fun ApiConversation.otherParticipant(currentUserId: String?): ApiParticipant? {
    if (type.lowercase() !in directConversationTypes) return null
    return participants.firstOrNull { it.userId != null && it.userId != currentUserId }
}

private fun ApiConversation.otherParticipantName(currentUserId: String?): String? {
    val other = otherParticipant(currentUserId) ?: return null
    return other.displayName?.takeIf { it.isNotBlank() }
        ?: other.username?.takeIf { it.isNotBlank() }
}

/**
 * The other participant's user id in a direct conversation — the presence-lookup key for a
 * conversation row/header (`ConversationListUiState.presenceStateFor` et al.). `null` for a
 * group/community/channel/bot conversation, or when no other participant is known.
 */
fun ApiConversation.otherParticipantUserId(currentUserId: String?): String? =
    otherParticipant(currentUserId)?.userId
