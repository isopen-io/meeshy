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

fun ApiConversation.displayTitle(): String =
    title?.takeIf { it.isNotBlank() }
        ?: preferences?.customName?.takeIf { it.isNotBlank() }
        ?: "Conversation"
