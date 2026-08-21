package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.StoryGroup
import me.meeshy.sdk.story.hasUnviewed
import me.meeshy.sdk.story.isFullyExpired
import me.meeshy.sdk.theme.otherParticipantUserId
import me.meeshy.ui.component.StoryRingState

/**
 * Pure port of iOS `StoryViewModel.storyRingState(forUserId:)` and
 * `ConversationListView.storyRingState(for:)` (SSOT:
 * `apps/ios/Meeshy/Features/Main/ViewModels/StoryViewModel.swift:1351`,
 * `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:690`).
 *
 * The rules — first match wins:
 *   1. A group conversation, or a direct one whose other participant cannot be
 *      resolved, carries no ring ([StoryRingState.None]).
 *   2. When the peer has no active story group (missing or [isFullyExpired]),
 *      the row carries no ring ([StoryRingState.None]).
 *   3. When the peer's group has any [hasUnviewed] story, the row is
 *      [StoryRingState.Unread].
 *   4. Otherwise the peer's group is fully viewed and still active → the row is
 *      [StoryRingState.Read].
 *
 * The pure resolver takes the caller-supplied `nowMillis` for testability; the
 * row wiring feeds it `System.currentTimeMillis()`.
 */
object ConversationStoryRing {

    /** Per-user rule (iOS `StoryViewModel.storyRingState(forUserId:)`). */
    fun ringFor(userId: String?, groups: List<StoryGroup>, nowMillis: Long): StoryRingState {
        val id = userId ?: return StoryRingState.None
        val group = groups.firstOrNull { it.id == id } ?: return StoryRingState.None
        if (group.isFullyExpired(nowMillis)) return StoryRingState.None
        return if (group.hasUnviewed()) StoryRingState.Unread else StoryRingState.Read
    }

    /** Row rule (iOS `ConversationListView.storyRingState(for:)` — direct-only gate). */
    fun ringFor(
        conversation: ApiConversation,
        currentUserId: String?,
        groups: List<StoryGroup>,
        nowMillis: Long,
    ): StoryRingState = ringFor(
        userId = conversation.otherParticipantUserId(currentUserId),
        groups = groups,
        nowMillis = nowMillis,
    )
}
