package me.meeshy.sdk.outbox.senders

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.ConversationPreferencesUpdate
import me.meeshy.sdk.outbox.ConversationPrefsPayload
import me.meeshy.sdk.outbox.OutboxKind
import me.meeshy.sdk.outbox.SendResult
import org.junit.Test
import java.io.IOException

class ConversationSendersTest {

    private val conversationApi = mockk<ConversationApi>()

    @Test
    fun `read receipt marks the row conversation as read`() = runTest {
        val handler = ReadReceiptHandler(conversationApi)
        val row = outboxRow(OutboxKind.READ_RECEIPT, targetId = "c1")

        coEvery { conversationApi.markRead("c1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { conversationApi.markRead("c1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)

        coEvery { conversationApi.markRead("c1") } throws IOException("offline")
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `mark unread flags the row conversation as unread`() = runTest {
        val handler = MarkUnreadHandler(conversationApi)
        val row = outboxRow(OutboxKind.MARK_UNREAD, targetId = "c1")

        coEvery { conversationApi.markUnread("c1") } returns accepted(Unit)
        assertThat(handler.send(row)).isEqualTo(SendResult.Success)

        coEvery { conversationApi.markUnread("c1") } returns refused()
        assertThat(handler.send(row)).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `conversation prefs sends the whole snapshot field by field`() = runTest {
        val handler = UpdateConversationPrefsHandler(conversationApi, senderJson)
        val snapshot = ConversationPrefsPayload(
            isPinned = true,
            isMuted = false,
            isArchived = false,
            mentionsOnly = true,
            categoryId = "cat-1",
            customName = "Famille",
            reaction = "❤️",
            tags = listOf("a", "b"),
        )
        val expected = ConversationPreferencesUpdate(
            isPinned = true,
            isMuted = false,
            isArchived = false,
            mentionsOnly = true,
            categoryId = "cat-1",
            customName = "Famille",
            reaction = "❤️",
            tags = listOf("a", "b"),
        )
        coEvery { conversationApi.updatePreferences("c1", expected) } returns accepted(Unit)

        val result = handler.send(
            outboxRow(OutboxKind.UPDATE_CONVERSATION_PREFS, targetId = "c1", payload = encodedPayload(snapshot)),
        )

        assertThat(result).isEqualTo(SendResult.Success)
        coVerify(exactly = 1) { conversationApi.updatePreferences("c1", expected) }
    }

    @Test
    fun `conversation prefs leaves the untouched optional fields unset`() = runTest {
        val handler = UpdateConversationPrefsHandler(conversationApi, senderJson)
        val snapshot = ConversationPrefsPayload(
            isPinned = false,
            isMuted = true,
            isArchived = false,
            mentionsOnly = false,
        )
        val expected = ConversationPreferencesUpdate(
            isPinned = false,
            isMuted = true,
            isArchived = false,
            mentionsOnly = false,
        )
        coEvery { conversationApi.updatePreferences("c1", expected) } returns refused()

        val result = handler.send(
            outboxRow(OutboxKind.UPDATE_CONVERSATION_PREFS, targetId = "c1", payload = encodedPayload(snapshot)),
        )

        assertThat(result).isEqualTo(SendResult.TransientFailure)
    }

    @Test
    fun `conversation prefs with an undecodable payload fails permanently`() = runTest {
        val handler = UpdateConversationPrefsHandler(conversationApi, senderJson)

        val result = handler.send(outboxRow(OutboxKind.UPDATE_CONVERSATION_PREFS, payload = "{}"))

        assertThat(result).isInstanceOf(SendResult.PermanentFailure::class.java)
    }
}
