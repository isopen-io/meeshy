package me.meeshy.app.stories

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.mayCurrentUserWrite
import me.meeshy.sdk.theme.accentHex
import me.meeshy.sdk.theme.displayTitle

/**
 * A conversation the user can send a story into — a thin presentation
 * projection so [StorySendToSheet] stays exempt glue. Mirrors
 * `me.meeshy.app.chat.ForwardTarget` (feature/chat, out of this module's
 * dependency graph) rather than importing it, since feature/stories does not
 * depend on feature/chat.
 */
data class StorySendTarget(
    val conversationId: String,
    val title: String,
    val type: String,
    val memberCount: Int,
    val avatar: String?,
    val accentHex: String,
)

/**
 * Pure SSOT deciding which conversations are eligible "send story to" targets
 * and how they present, and how a search query narrows them — parity with
 * `ForwardTargets` (feature/chat). Unlike forwarding a message from within a
 * conversation, sending a story has no source conversation to exclude: every
 * conversation the user CAN WRITE INTO is a valid target.
 *
 * Rules:
 *  - A conversation the caller cannot write into ([ApiConversation.mayCurrentUserWrite]
 *    — an announcement channel below admin, an inactive conversation, one the
 *    reader soft-deleted for themselves) is never offered: it is a tappable row
 *    that would produce a message the gateway refuses (issue found in review).
 *  - A blank (or whitespace-only) query keeps every remaining conversation.
 *  - A non-blank query is trimmed, then matched case-insensitively against the
 *    conversation's resolved [displayTitle].
 *  - Input order is preserved (the caller already ordered the list).
 */
object StorySendTargets {
    fun of(
        conversations: List<ApiConversation>,
        query: String,
        currentUserId: String? = null,
    ): List<StorySendTarget> {
        val trimmed = query.trim()
        return conversations.asSequence()
            .filter { it.mayCurrentUserWrite(currentUserId) }
            .map { conversation ->
                StorySendTarget(
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
