package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

/**
 * A conversation the user can forward a message into — a thin presentation
 * projection so the forward-picker Composable stays exempt glue.
 */
data class ForwardTarget(
    val conversationId: String,
    val title: String,
    val type: String,
    val memberCount: Int,
    val avatar: String?,
    val accentHex: String,
)

/**
 * Pure SSOT deciding which conversations are eligible forward targets and how
 * they present — parity with iOS `ForwardPickerSheet.filteredConversations`.
 * Keeping the "who can I forward to / how does it match the query" decision out
 * of the Composable makes it JVM-testable.
 *
 * Rules:
 *  - The source conversation is never a target (you don't forward a message back
 *    into the conversation it came from).
 *  - A blank (or whitespace-only) query keeps every non-source conversation.
 *  - A non-blank query is trimmed, then matched case-insensitively against the
 *    conversation's resolved [displayTitle] (what the user actually sees — the
 *    other participant's name for a direct conversation).
 *  - Input order is preserved (the caller already ordered the list).
 *  - Each target carries the conversation's deterministic [accentHex] so the row
 *    is colour-coherent with the rest of the app, and a blank avatar degrades to
 *    null.
 */
object ForwardTargets {
    fun of(
        conversations: List<ApiConversation>,
        sourceConversationId: String,
        query: String,
        currentUserId: String? = null,
    ): List<ForwardTarget> {
        val trimmed = query.trim()
        return conversations.asSequence()
            .filter { it.id != sourceConversationId }
            .map { conversation ->
                ForwardTarget(
                    conversationId = conversation.id,
                    title = conversation.displayTitle(currentUserId),
                    type = conversation.type,
                    memberCount = conversation.memberCount,
                    avatar = conversation.avatar?.takeIf { it.isNotBlank() },
                    accentHex = conversation.accentHex(),
                )
            }
            .filter { trimmed.isEmpty() || it.title.contains(trimmed, ignoreCase = true) }
            .toList()
    }
}
