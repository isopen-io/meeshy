package me.meeshy.app.shortcuts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

/**
 * Pure state derivation for the app's dynamic launcher shortcuts
 * (`ShortcutManagerCompat.setDynamicShortcuts`) — Android's closest local,
 * fully-testable equivalent to iOS's `OpenRecentConversationIntent`/
 * `MeeshyAppShortcuts` "Recent Conversation" App Shortcut. Reuses the same
 * pinned-first-then-recency ordering [me.meeshy.app.conversations.ConversationRowTime]
 * SSOT the home-screen widgets already apply, and [ApiConversation.displayTitle] for
 * the label. The `ShortcutManagerCompat`/`ShortcutInfoCompat` platform glue itself is
 * exempt (`TDD-COVERAGE.md`) — this is the decision worth covering on the JVM.
 */
class DynamicShortcutsPresentationTest {

    private fun conversation(
        id: String,
        type: String = "direct",
        title: String? = null,
        participants: List<ApiParticipant> = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-other", userId = "other-$id", displayName = "Contact $id"),
        ),
        isPinned: Boolean = false,
        lastMessage: ApiConversationLastMessage? = ApiConversationLastMessage(
            id = "m-$id",
            createdAt = "2026-08-01T00:00:00.000Z",
        ),
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        participants = participants,
        lastMessage = lastMessage,
        preferences = ApiConversationPreferences(isPinned = isPinned),
    )

    @Test
    fun `an empty conversation list resolves to an empty presentation`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = emptyList(),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `a direct conversation's label resolves the other participant's name`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows.single().shortLabel).isEqualTo("Contact c1")
    }

    @Test
    fun `a group conversation's label is its own title`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(conversation(id = "c1", type = "group", title = "Team")),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows.single().shortLabel).isEqualTo("Team")
    }

    @Test
    fun `a pinned conversation sorts before a more recently active unpinned one`() {
        val pinned = conversation(
            id = "pinned",
            isPinned = true,
            lastMessage = ApiConversationLastMessage(createdAt = "2020-01-01T00:00:00.000Z"),
        )
        val recentUnpinned = conversation(
            id = "recent",
            isPinned = false,
            lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"),
        )

        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(recentUnpinned, pinned),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("pinned", "recent").inOrder()
    }

    @Test
    fun `among unpinned conversations, the most recently active sorts first`() {
        val older = conversation(id = "older", lastMessage = ApiConversationLastMessage(createdAt = "2026-01-01T00:00:00.000Z"))
        val newer = conversation(id = "newer", lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"))

        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(older, newer),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("newer", "older").inOrder()
    }

    @Test
    fun `the presentation caps at the device-reported max count`() {
        val conversations = (1..8).map { conversation(id = "c$it") }

        val presentation = DynamicShortcutsPresentation.from(
            conversations = conversations,
            currentUserId = "me",
            maxCount = 3,
        )

        assertThat(presentation.rows).hasSize(3)
    }

    @Test
    fun `a max count of zero (rate-limited device) resolves to no shortcuts`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            maxCount = 0,
        )

        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `a negative max count is treated as zero, not a crash`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            maxCount = -1,
        )

        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `the shortcut id matches the conversation id`() {
        val presentation = DynamicShortcutsPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            maxCount = 4,
        )

        assertThat(presentation.rows.single().id).isEqualTo("c1")
    }
}
