package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.StatusEntry
import org.junit.Test

/**
 * Pure port of iOS `ConversationListView.conversationMoodStatus(for:)` +
 * `statusViewModel.statusForUser(userId:)?.moodEmoji` (SSOT:
 * `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift:695`).
 *
 * The row rule, first match wins:
 *   1. a group/community/channel/bot conversation, or a direct one whose other
 *      participant cannot be resolved → no mood badge (`null`).
 *   2. the peer has no live status entry → no mood badge (`null`).
 *   3. the peer's status carries a blank mood emoji → no mood badge (`null`).
 *   4. otherwise → the peer's non-blank mood emoji.
 *
 * Mirrors the established Contacts precedent (`ContactsListViewModel.moodEmojiFor`)
 * — the resolved status set is whatever the shared status bar already holds, so
 * this is a decorative avatar affordance, never primary content.
 */
class ConversationMoodStatusTest {

    private fun status(userId: String, moodEmoji: String): StatusEntry =
        StatusEntry(id = "st-$userId", userId = userId, moodEmoji = moodEmoji)

    private fun direct(otherUserId: String?): ApiConversation =
        ApiConversation(
            id = "c1",
            type = "direct",
            participants = listOfNotNull(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                otherUserId?.let { ApiParticipant(id = "p-other", userId = it, displayName = "Other") },
            ),
        )

    @Test
    fun `a group conversation never carries a mood badge`() {
        val groupConversation = ApiConversation(
            id = "c2",
            type = "group",
            participants = listOf(
                ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
                ApiParticipant(id = "p-other", userId = "other", displayName = "Other"),
            ),
        )
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = groupConversation,
            currentUserId = "me",
            statuses = listOf(status("other", "😄")),
        )
        assertThat(mood).isNull()
    }

    @Test
    fun `a direct conversation with no resolvable other participant carries no mood badge`() {
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = null),
            currentUserId = "me",
            statuses = listOf(status("other", "😄")),
        )
        assertThat(mood).isNull()
    }

    @Test
    fun `a direct conversation whose peer has no live status carries no mood badge`() {
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            statuses = emptyList(),
        )
        assertThat(mood).isNull()
    }

    @Test
    fun `a direct conversation surfaces the peer's non-blank mood emoji`() {
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            statuses = listOf(status("other", "🎉")),
        )
        assertThat(mood).isEqualTo("🎉")
    }

    @Test
    fun `a peer status with a blank mood emoji yields no badge`() {
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            statuses = listOf(status("other", "   ")),
        )
        assertThat(mood).isNull()
    }

    @Test
    fun `the peer's status is picked among several`() {
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            statuses = listOf(
                status("someone-a", "😀"),
                status("other", "🌙"),
                status("someone-b", "🔥"),
            ),
        )
        assertThat(mood).isEqualTo("🌙")
    }

    @Test
    fun `currentUserId decides which side is the peer`() {
        // currentUserId = "other" makes "me" the OTHER participant; only "me" has a status.
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "other",
            statuses = listOf(status("me", "☕")),
        )
        assertThat(mood).isEqualTo("☕")
    }

    @Test
    fun `a status belonging to the signed-in user is never surfaced as the peer badge`() {
        // Only the current user has a status; the peer has none → no badge (never self).
        val mood = ConversationMoodStatus.moodEmojiFor(
            conversation = direct(otherUserId = "other"),
            currentUserId = "me",
            statuses = listOf(status("me", "😎")),
        )
        assertThat(mood).isNull()
    }
}
