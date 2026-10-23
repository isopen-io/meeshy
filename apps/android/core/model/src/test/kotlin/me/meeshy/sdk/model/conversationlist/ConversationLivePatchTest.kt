package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.preview.PreviewFieldUpdate
import org.junit.Test

class ConversationLivePatchTest {

    private fun group(
        last: ApiConversationLastMessage? = ApiConversationLastMessage(
            id = "m1", content = "old", senderName = "Alice", createdAt = "2026-10-01T10:00:00.000Z",
        ),
    ) = ApiConversation(id = "c1", type = "group", title = "Team", lastMessage = last)

    private fun apply(
        conversation: ApiConversation,
        event: ConversationUpdatedSocketEvent,
        reader: String? = "me",
    ) = ConversationLivePatch.applyUpdated(conversation, event, reader, "Vous")

    @Test
    fun `metadata fields are patched in place`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1", title = "Renamed", description = "d", avatar = "a", banner = "b",
                isAnnouncementChannel = true, defaultWriteRole = "admin", slowModeSeconds = 30,
                autoTranslateEnabled = true,
            ),
        )!!
        assertThat(patched.title).isEqualTo("Renamed")
        assertThat(patched.description).isEqualTo("d")
        assertThat(patched.avatar).isEqualTo("a")
        assertThat(patched.banner).isEqualTo("b")
        assertThat(patched.isAnnouncementChannel).isTrue()
        assertThat(patched.defaultWriteRole).isEqualTo("admin")
        assertThat(patched.slowModeSeconds).isEqualTo(30)
        assertThat(patched.autoTranslateEnabled).isTrue()
    }

    @Test
    fun `a direct conversation never takes the raw title`() {
        val direct = ApiConversation(id = "c1", type = "direct", title = null)
        assertThat(apply(direct, ConversationUpdatedSocketEvent(conversationId = "c1", title = "Hacked"))).isNull()
    }

    @Test
    fun `an event that changes nothing patches nothing`() {
        assertThat(apply(group(), ConversationUpdatedSocketEvent(conversationId = "c1"))).isNull()
    }

    @Test
    fun `a newer message replaces the whole preview group and takes the Prisme of the frame`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T11:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m2"),
                lastMessagePreview = "Hello",
                lastMessageSenderName = PreviewFieldUpdate.Replaced("Bob"),
                lastMessageSenderUserId = "u-bob",
                lastMessageTranslations = PreviewFieldUpdate.Replaced(mapOf("fr" to "Bonjour")),
                lastMessageOriginalLanguage = "en",
            ),
        )!!
        assertThat(patched.lastMessage?.id).isEqualTo("m2")
        assertThat(patched.lastMessage?.content).isEqualTo("Hello")
        assertThat(patched.lastMessage?.senderName).isEqualTo("Bob")
        assertThat(patched.lastMessage?.createdAt).isEqualTo("2026-10-01T11:00:00.000Z")
        assertThat(patched.lastMessageTranslations).containsExactly("fr", "Bonjour")
        assertThat(patched.lastMessageOriginalLanguage).isEqualTo("en")
    }

    @Test
    fun `my own message from another device says You`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T11:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m2"),
                lastMessagePreview = "Hi",
                lastMessageSenderUserId = "me",
            ),
        )!!
        assertThat(patched.lastMessage?.senderName).isEqualTo("Vous")
        assertThat(patched.lastMessage?.senderId).isNull()
    }

    @Test
    fun `a new message without author drops the author of the previous one`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T11:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m2"),
                lastMessagePreview = "Hi",
            ),
        )!!
        assertThat(patched.lastMessage?.senderName).isNull()
    }

    @Test
    fun `an older frame does not move the preview back`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T09:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m0"),
                lastMessagePreview = "ancient",
                title = "T2",
            ),
        )!!
        assertThat(patched.lastMessage?.content).isEqualTo("old")
        assertThat(patched.title).isEqualTo("T2")
    }

    @Test
    fun `a recalculated preview may move back in time`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T09:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m0"),
                lastMessagePreview = "previous",
                previewRecalculated = true,
            ),
        )!!
        assertThat(patched.lastMessage?.id).isEqualTo("m0")
        assertThat(patched.lastMessage?.content).isEqualTo("previous")
    }

    @Test
    fun `a null last message id clears the preview`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(conversationId = "c1", lastMessageId = PreviewFieldUpdate.Replaced(null)),
        )!!
        assertThat(patched.lastMessage).isNull()
    }

    @Test
    fun `an edit of the same message keeps its author`() {
        val patched = apply(
            group(),
            ConversationUpdatedSocketEvent(
                conversationId = "c1",
                lastMessageAt = "2026-10-01T10:00:00.000Z",
                lastMessageId = PreviewFieldUpdate.Replaced("m1"),
                lastMessagePreview = "edited",
            ),
        )!!
        assertThat(patched.lastMessage?.content).isEqualTo("edited")
        assertThat(patched.lastMessage?.senderName).isEqualTo("Alice")
    }

    @Test
    fun `unread count is absolute and idempotent`() {
        assertThat(ConversationLivePatch.applyUnread(group().copy(unreadCount = 2), 5)?.unreadCount).isEqualTo(5)
        assertThat(ConversationLivePatch.applyUnread(group().copy(unreadCount = 5), 5)).isNull()
    }

    @Test
    fun `member count follows relative deltas and never goes below zero`() {
        val base = group().copy(serverMemberCount = 3)
        assertThat(ConversationLivePatch.applyMemberCount(base, delta = 1)?.memberCount).isEqualTo(4)
        assertThat(ConversationLivePatch.applyMemberCount(base, delta = -1)?.memberCount).isEqualTo(2)
        assertThat(ConversationLivePatch.applyMemberCount(base.copy(serverMemberCount = 0), delta = -1)).isNull()
    }

    @Test
    fun `server absolute count wins over a delta`() {
        val patched = ConversationLivePatch.applyMemberCount(
            group().copy(serverMemberCount = 3), delta = 1, absolute = 10, capped = false,
        )!!
        assertThat(patched.memberCount).isEqualTo(10)
    }

    @Test
    fun `a capped count is never extrapolated beyond the ceiling`() {
        val capped = group().copy(serverMemberCount = 199, memberCountCapped = true)
        assertThat(ConversationLivePatch.applyMemberCount(capped, delta = 1)).isNull()
        assertThat(ConversationLivePatch.applyMemberCount(capped, delta = -1)?.memberCount).isEqualTo(198)
    }
}
