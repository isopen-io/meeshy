package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.theme.accentHex
import org.junit.Test

/**
 * Pure state derivation for [RecentConversationsWidget] — mirrors iOS
 * `WidgetDataManager.publishConversations`'s ordering (pinned first, then most
 * recent) and `formatLastMessage` (sender prefix on non-direct conversations
 * only). The Glance `@Composable` content itself is UI glue (exempt,
 * `TDD-COVERAGE.md`); this is the decision worth covering on the JVM.
 */
class RecentConversationsWidgetPresentationTest {

    private val labels = LastMessagePreviewLabels(
        photo = "📷 Photo",
        video = "🎬 Vidéo",
        voice = "🎵 Message vocal",
        file = "📎 Fichier",
        location = "📍 Localisation",
        none = "Aucun message",
        you = "Vous",
        senderFormat = "%1\$s : %2\$s",
        draftPrefix = "Brouillon : ",
    )

    private fun conversation(
        id: String,
        type: String = "direct",
        title: String? = null,
        participants: List<ApiParticipant> = listOf(
            ApiParticipant(id = "p-me", userId = "me", displayName = "Me"),
            ApiParticipant(id = "p-other", userId = "other-$id", displayName = "Contact $id"),
        ),
        lastMessage: ApiConversationLastMessage? = ApiConversationLastMessage(
            id = "m-$id",
            content = "Hello from $id",
            senderId = "other-$id",
            senderName = "Contact $id",
            messageType = "text",
            createdAt = "2026-08-01T00:00:00.000Z",
        ),
        unreadCount: Int = 0,
        isPinned: Boolean = false,
        updatedAt: String? = null,
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        participants = participants,
        lastMessage = lastMessage,
        unreadCount = unreadCount,
        updatedAt = updatedAt,
        preferences = ApiConversationPreferences(isPinned = isPinned),
    )

    @Test
    fun `an empty conversation list resolves to an empty presentation`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = emptyList(),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.isEmpty).isTrue()
        assertThat(presentation.rows).isEmpty()
    }

    @Test
    fun `a direct conversation resolves the other participant's name, not the current user`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().title).isEqualTo("Contact c1")
    }

    @Test
    fun `a direct conversation's preview carries no sender prefix`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().preview).isEqualTo("Hello from c1")
    }

    @Test
    fun `a group conversation's preview is prefixed with the sender's name`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", type = "group", title = "Team")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().preview).isEqualTo("Contact c1 : Hello from c1")
    }

    @Test
    fun `a group conversation whose last message is mine shows the you label`() {
        val mine = ApiConversationLastMessage(
            id = "m1",
            content = "On my way",
            senderId = "me",
            senderName = "Me",
            messageType = "text",
            createdAt = "2026-08-01T00:00:00.000Z",
        )
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", type = "group", title = "Team", lastMessage = mine)),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().preview).isEqualTo("Vous : On my way")
    }

    @Test
    fun `a positive unread count marks the row unread`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", unreadCount = 3)),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().isUnread).isTrue()
    }

    @Test
    fun `a zero unread count leaves the row read`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", unreadCount = 0)),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().isUnread).isFalse()
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

        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(recentUnpinned, pinned),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("pinned", "recent").inOrder()
    }

    @Test
    fun `among unpinned conversations, the most recently active sorts first`() {
        val older = conversation(id = "older", lastMessage = ApiConversationLastMessage(createdAt = "2026-01-01T00:00:00.000Z"))
        val newer = conversation(id = "newer", lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"))

        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(older, newer),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.map { it.id }).containsExactly("newer", "older").inOrder()
    }

    @Test
    fun `the presentation caps at 5 rows even with more conversations cached`() {
        val conversations = (1..8).map { conversation(id = "c$it") }

        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = conversations,
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows).hasSize(5)
    }

    @Test
    fun `a row's accent color matches the conversation's deterministic accent`() {
        val convo = conversation(id = "c1", type = "group", title = "Team")

        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(convo),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().accentHex).isEqualTo(convo.accentHex())
    }

    @Test
    fun `a conversation with no last message shows the empty label`() {
        val presentation = RecentConversationsWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", lastMessage = null)),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation.rows.single().preview).isEqualTo("Aucun message")
    }
}
