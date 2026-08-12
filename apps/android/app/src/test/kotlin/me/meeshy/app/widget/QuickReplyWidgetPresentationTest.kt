package me.meeshy.app.widget

import com.google.common.truth.Truth.assertThat
import me.meeshy.app.conversations.LastMessagePreviewLabels
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ApiParticipant
import org.junit.Test

/**
 * Pure state derivation for [QuickReplyWidget] — mirrors iOS `QuickReplyWidgetView`'s
 * featured-conversation rule (`entry.conversations.first(where: isUnread) ??
 * entry.conversations.first`) over the SAME pinned-first-then-recency ordering the
 * other two conversation-backed widgets already apply. The Glance `@Composable`
 * content itself is UI glue (exempt, `TDD-COVERAGE.md`); this is the decision
 * worth covering on the JVM.
 */
class QuickReplyWidgetPresentationTest {

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
        unreadCount: Int = 0,
        isPinned: Boolean = false,
        lastMessage: ApiConversationLastMessage? = ApiConversationLastMessage(
            id = "m-$id",
            content = "Hello from $id",
            senderId = "other-$id",
            senderName = "Contact $id",
            messageType = "text",
            createdAt = "2026-08-01T00:00:00.000Z",
        ),
    ) = ApiConversation(
        id = id,
        type = type,
        title = title,
        participants = participants,
        lastMessage = lastMessage,
        unreadCount = unreadCount,
        preferences = ApiConversationPreferences(isPinned = isPinned),
    )

    @Test
    fun `an empty conversation list resolves to no presentation`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = emptyList(),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation).isNull()
    }

    @Test
    fun `an unread conversation is featured even when a more recent one is read`() {
        val read = conversation(
            id = "read",
            unreadCount = 0,
            lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"),
        )
        val unread = conversation(
            id = "unread",
            unreadCount = 2,
            lastMessage = ApiConversationLastMessage(createdAt = "2020-01-01T00:00:00.000Z"),
        )

        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(read, unread),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.conversationId).isEqualTo("unread")
    }

    @Test
    fun `a pinned but read conversation is skipped in favor of an unread one`() {
        val pinnedRead = conversation(id = "pinned-read", isPinned = true, unreadCount = 0)
        val unread = conversation(id = "unread", isPinned = false, unreadCount = 1)

        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(pinnedRead, unread),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.conversationId).isEqualTo("unread")
    }

    @Test
    fun `with no unread conversations, the most recently active one is featured`() {
        val older = conversation(id = "older", lastMessage = ApiConversationLastMessage(createdAt = "2026-01-01T00:00:00.000Z"))
        val newer = conversation(id = "newer", lastMessage = ApiConversationLastMessage(createdAt = "2026-08-01T00:00:00.000Z"))

        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(older, newer),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.conversationId).isEqualTo("newer")
    }

    @Test
    fun `with no unread conversations, a pinned one is featured over a more recent unpinned one`() {
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

        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(recentUnpinned, pinned),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.conversationId).isEqualTo("pinned")
    }

    @Test
    fun `a direct conversation's title resolves the other participant's name`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.title).isEqualTo("Contact c1")
    }

    @Test
    fun `a group conversation's title is its own title`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", type = "group", title = "Team")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.title).isEqualTo("Team")
    }

    @Test
    fun `the preview reuses the shared last-message formatter`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1")),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.preview).isEqualTo("Hello from c1")
    }

    @Test
    fun `a conversation with no last message shows the empty label`() {
        val presentation = QuickReplyWidgetPresentation.from(
            conversations = listOf(conversation(id = "c1", lastMessage = null)),
            currentUserId = "me",
            previewLabels = labels,
        )

        assertThat(presentation?.preview).isEqualTo("Aucun message")
    }
}
