package me.meeshy.sdk.model.conversationlist

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.ApiMessage
import org.junit.Test

class ConversationPreviewOnSendTest {

    private fun row(lastId: String? = "m0", at: String = "2026-11-03T09:00:00.000Z", unread: Int = 2) = ApiConversation(
        id = "c1",
        unreadCount = unread,
        lastMessage = lastId?.let { ApiConversationLastMessage(id = it, content = "avant", createdAt = at) },
    )

    private fun facet(id: String, text: String = "salut", at: String = "2026-11-03T10:00:00.000Z") = LastMessageFacet.of(
        message = ApiMessage(id = id, conversationId = "c1", senderId = "me", content = text, createdAt = at),
        readerId = "me",
        youLabel = "Vous",
    )

    @Test
    fun `an optimistic send replaces the preview and keeps the unread count`() {
        val result = ConversationPreviewOnSend.staging(row(), facet("cid_1"))

        assertThat(result.lastMessage?.id).isEqualTo("cid_1")
        assertThat(result.lastMessage?.content).isEqualTo("salut")
        assertThat(result.unreadCount).isEqualTo(2)
    }

    @Test
    fun `a send older than the preview in place does not replace it`() {
        val newer = row(lastId = "m9", at = "2026-11-03T11:00:00.000Z")

        assertThat(ConversationPreviewOnSend.staging(newer, facet("cid_1")).lastMessage?.id).isEqualTo("m9")
    }

    @Test
    fun `rolling back the preview message restores the previous facet`() {
        val staged = ConversationPreviewOnSend.staging(row(), facet("cid_1"))

        val result = ConversationPreviewOnSend.rollingBack(staged, "cid_1", facet("m0", "avant", "2026-11-03T09:00:00.000Z"))

        assertThat(result.lastMessage?.id).isEqualTo("m0")
        assertThat(result.lastMessage?.content).isEqualTo("avant")
    }

    @Test
    fun `rolling back with no remaining message empties the preview`() {
        val staged = ConversationPreviewOnSend.staging(row(lastId = null), facet("cid_1"))

        assertThat(ConversationPreviewOnSend.rollingBack(staged, "cid_1", null).lastMessage).isNull()
    }

    @Test
    fun `rolling back a message that is no longer the preview changes nothing`() {
        val socketIn = row(lastId = "m7", at = "2026-11-03T12:00:00.000Z")

        assertThat(ConversationPreviewOnSend.rollingBack(socketIn, "cid_1", facet("m0"))).isEqualTo(socketIn)
    }
}
