package me.meeshy.app.chat

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.share.ShareRecipient
import me.meeshy.sdk.model.share.ShareRecipientMerge
import me.meeshy.sdk.share.ShareRecipientDirectory
import me.meeshy.sdk.theme.accentHex

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
    /** Le compte du vis-à-vis d'une conversation directe : sa présence servie lit la carte unique. */
    val peerUserId: String? = null,
    /** A one-to-one conversation: its row says « Conversation », never a member count. */
    val isDirect: Boolean = false,
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
 *  - A conversation the caller cannot write into ([ApiConversation.mayCurrentUserWrite]
 *    — an announcement channel below admin, an inactive conversation, one the
 *    reader soft-deleted for themselves) is never offered: it is a tappable row
 *    that would produce a message the gateway refuses (issue found in review,
 *    parity with `StorySendTargets`).
 *  - A direct conversation with a BLOCKED person ([blockedUserIds]) is never offered.
 *  - A blank (or whitespace-only) query keeps every remaining non-source conversation.
 *  - A non-blank query is trimmed, then matched case-insensitively against the
 *    conversation's resolved [displayTitle] (what the user actually sees — the
 *    other participant's name for a direct conversation).
 *  - Input order is preserved (the caller already ordered the list).
 *  - Each target carries the conversation's deterministic [accentHex] so the row
 *    is colour-coherent with the rest of the app, and a blank avatar degrades to
 *    null.
 */
object ForwardTargets {
    /**
     * Who may be offered is the single law of [ShareRecipientDirectory] (source excluded, write-admission,
     * blocked direct, input order kept); this only projects its rows and applies the accent-insensitive name filter.
     */
    fun of(
        conversations: List<ApiConversation>,
        sourceConversationId: String,
        query: String,
        currentUserId: String? = null,
        blockedUserIds: Set<String> = emptySet(),
    ): List<ForwardTarget> {
        val byId = conversations.associateBy { it.id }
        val eligible = ShareRecipientDirectory.fromConversations(conversations, sourceConversationId, currentUserId, blockedUserIds)
        return ShareRecipientMerge.matching(eligible, query).mapNotNull { recipient ->
            val conversation = byId[recipient.conversationId] ?: return@mapNotNull null
            ForwardTarget(
                conversationId = conversation.id,
                title = recipient.title,
                type = conversation.type,
                memberCount = conversation.memberCount,
                avatar = recipient.avatarUrl,
                accentHex = recipient.accentHex ?: conversation.accentHex(),
                peerUserId = recipient.userId,
                isDirect = recipient.detail == ShareRecipient.Detail.Direct,
            )
        }
    }
}
