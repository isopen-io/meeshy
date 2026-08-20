package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.status.statusForUser
import me.meeshy.sdk.theme.otherParticipantUserId

/**
 * Pure port of iOS `ConversationListView.conversationMoodStatus(for:)` +
 * `statusViewModel.statusForUser(userId:)?.moodEmoji` (SSOT:
 * `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:695`).
 *
 * The mood badge is the peer's live ephemeral status emoji, shown on a direct
 * conversation row's avatar. The row rule — first match wins:
 *   1. a group/community/channel/bot conversation, or a direct one whose other
 *      participant cannot be resolved, has no badge (`otherParticipantUserId`
 *      returns `null` for both — the same direct-only gate the story ring uses).
 *   2. the peer has no live [StatusEntry] → no badge.
 *   3. the peer's status carries a blank mood emoji → no badge.
 *   4. otherwise → the peer's non-blank mood emoji.
 *
 * Reuses the shared SSOTs [otherParticipantUserId] (peer resolution) and
 * [statusForUser] (the exact lookup Contacts uses, `ContactsListViewModel
 * .moodEmojiFor`) so mood resolution stays identical across every surface.
 */
object ConversationMoodStatus {

    fun moodEmojiFor(
        conversation: ApiConversation,
        currentUserId: String?,
        statuses: List<StatusEntry>,
    ): String? {
        val peerId = conversation.otherParticipantUserId(currentUserId) ?: return null
        return statuses.statusForUser(peerId)?.moodEmoji?.takeIf { it.isNotBlank() }
    }
}
