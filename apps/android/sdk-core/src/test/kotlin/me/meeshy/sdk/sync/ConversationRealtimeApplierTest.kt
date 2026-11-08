package me.meeshy.sdk.sync

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationEventApplier
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationObsoletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.Test

class ConversationRealtimeApplierTest {

    private class Rig {
        val updated = MutableSharedFlow<ConversationUpdatedSocketEvent>()
        val unread = MutableSharedFlow<UnreadUpdateEvent>()
        val restored = MutableSharedFlow<ConversationRestoredSocketEvent>()
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>()
        val obsoleted = MutableSharedFlow<ConversationObsoletedSocketEvent>()
        val patcher = mockk<ConversationLivePatcher>(relaxed = true)
        val events = mockk<ConversationEventApplier>(relaxed = true)
        val stars = InMemoryStarredMessagesStore(
            StarredMessages(listOf(StarredMessage(messageId = "m-c1", conversationId = "c1"), StarredMessage(messageId = "m-c2", conversationId = "c2"))),
        )
        val registrar = RecordingRegistrar()

        init {
            val socket = mockk<MessageSocketManager> {
                every { conversationUpdated } returns updated
                every { unreadUpdated } returns unread
                every { conversationRestored } returns restored
                every { conversationDeleted } returns deleted
                every { conversationClosed } returns closed
                every { conversationObsoleted } returns obsoleted
            }
            ConversationRealtimeApplier(socket, patcher, events, stars).subscribe(registrar)
        }
    }

    @Test
    fun `un conversation updated se plie dans la ligne sans relire la liste`() = runTest {
        val rig = Rig()
        val event = ConversationUpdatedSocketEvent(conversationId = "c1", title = "Renamed")
        rig.registrar.deliver(rig.updated, event)
        coVerify(exactly = 1) { rig.events.applyUpdated(event) }
    }

    @Test
    fun `un unread updated pose le compteur absolu du serveur`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.unread, UnreadUpdateEvent(conversationId = "c1", unreadCount = 4))
        coVerify(exactly = 1) { rig.patcher.applyUnread("c1", 4) }
    }

    @Test
    fun `unread updated et conversation updated partagent la voie des messages`() {
        val rig = Rig()
        val lane = OrderedEventLane.Family.MESSAGES
        assertThat(rig.registrar.familyOf(rig.updated)).isEqualTo(lane)
        assertThat(rig.registrar.familyOf(rig.unread)).isEqualTo(lane)
        assertThat(rig.registrar.familyOf(rig.deleted)).isEqualTo(lane)
    }

    @Test
    fun `une conversation restauree est relue par id`() = runTest {
        val rig = Rig()
        val event = ConversationRestoredSocketEvent(conversationId = "c9")
        rig.registrar.deliver(rig.restored, event)
        coVerify(exactly = 1) { rig.events.applyRestored(event) }
    }

    @Test
    fun `deleted retire la ligne, son cache et ses etoiles`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.deleted, ConversationDeletedSocketEvent(conversationId = "c1"))
        coVerify(exactly = 1) { rig.patcher.remove("c1") }
        assertThat(rig.stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
    }

    @Test
    fun `closed et obsoleted retirent la ligne`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.closed, ConversationClosedSocketEvent(conversationId = "c1", closedBy = "creator"))
        rig.registrar.deliver(rig.obsoleted, ConversationObsoletedSocketEvent(conversationId = "c2"))
        coVerify(exactly = 1) { rig.patcher.remove("c1") }
        coVerify(exactly = 1) { rig.patcher.remove("c2") }
        assertThat(rig.stars.starred.value.items).isEmpty()
    }

    @Test
    fun `un evenement sans identifiant utilisable ne retire rien`() = runTest {
        val rig = Rig()
        rig.registrar.deliver(rig.deleted, ConversationDeletedSocketEvent(conversationId = ""))
        coVerify(exactly = 0) { rig.patcher.remove(any()) }
    }
}
