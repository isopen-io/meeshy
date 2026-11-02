package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.coVerifyOrder
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationLivePatcher
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.ParticipantBannedEvent
import me.meeshy.sdk.model.ParticipantJoinedEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.ParticipantUnbannedEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListRealtimeBinderPatchTest {

    private class Frames {
        val unread = MutableSharedFlow<UnreadUpdateEvent>(extraBufferCapacity = 64)
        val received = MutableSharedFlow<ApiMessage>(extraBufferCapacity = 64)
        val updated = MutableSharedFlow<ConversationUpdatedSocketEvent>(extraBufferCapacity = 64)
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>(extraBufferCapacity = 64)
        val restored = MutableSharedFlow<ConversationRestoredSocketEvent>(extraBufferCapacity = 64)
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>(extraBufferCapacity = 64)
        val left = MutableSharedFlow<ParticipantLeftEvent>(extraBufferCapacity = 64)
        val banned = MutableSharedFlow<ParticipantBannedEvent>(extraBufferCapacity = 64)
        val joined = MutableSharedFlow<ParticipantJoinedEvent>(extraBufferCapacity = 64)
        val unbanned = MutableSharedFlow<ParticipantUnbannedEvent>(extraBufferCapacity = 64)
        val connection = MutableStateFlow(SocketConnectionState.DISCONNECTED)
    }

    private class Rig(val repo: ConversationRepository, val patcher: ConversationLivePatcher)

    private fun rig(): Rig = Rig(
        repo = mockk<ConversationRepository>(relaxed = true),
        patcher = mockk<ConversationLivePatcher>(relaxed = true),
    )

    private fun TestScope.binder(
        frames: Frames,
        rig: Rig,
        stars: InMemoryStarredMessagesStore = InMemoryStarredMessagesStore(),
        me: String? = "me",
    ): ConversationListRealtimeBinder = ConversationListRealtimeBinder(
        scope = backgroundScope,
        repository = rig.repo,
        messageSocketManager = mockk<MessageSocketManager> {
            every { unreadUpdated } returns frames.unread
            every { messageReceived } returns frames.received
            every { conversationUpdated } returns frames.updated
            every { conversationDeleted } returns frames.deleted
            every { conversationRestored } returns frames.restored
            every { conversationClosed } returns frames.closed
            every { participantLeft } returns frames.left
            every { participantBanned } returns frames.banned
            every { participantJoined } returns frames.joined
            every { participantUnbanned } returns frames.unbanned
        },
        preferencesSocketManager = mockk<PreferencesSocketManager> {
            every { conversationPreferencesUpdated } returns
                MutableSharedFlow<UserPreferencesConversationUpdatedSocketData>()
        },
        starredStore = stars,
        currentUserId = { me },
        patcher = rig.patcher,
        connectionState = frames.connection,
    ).also { it.start() }

    private fun star(conversationId: String) =
        StarredMessage(messageId = "m-$conversationId", conversationId = conversationId)

    @Test
    fun `an incoming message is patched in place and never triggers a full reread`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val rig = rig()
            binder(frames, rig)
            runCurrent()
            val message = ApiMessage(id = "m1", conversationId = "c1")

            frames.received.emit(message)
            runCurrent()

            coVerify(exactly = 1) { rig.patcher.applyMessage(message) }
            coVerify(exactly = 0) { rig.repo.refresh() }
        }

    @Test
    fun `the three frames of one message are patched in arrival order with zero rereads`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val rig = rig()
            binder(frames, rig)
            runCurrent()
            val message = ApiMessage(id = "m1", conversationId = "c1")
            val update = ConversationUpdatedSocketEvent(conversationId = "c1")

            frames.received.emit(message)
            frames.updated.emit(update)
            frames.unread.emit(UnreadUpdateEvent(conversationId = "c1", unreadCount = 1))
            runCurrent()

            coVerifyOrder {
                rig.patcher.applyMessage(message)
                rig.patcher.applyUpdated(update)
                rig.patcher.applyUnread("c1", 1)
            }
            coVerify(exactly = 0) { rig.repo.refresh() }
        }

    @Test
    fun `conversation deleted sheds its stars and removes the row`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"), star("c2"))))
        binder(frames, rig, stars)
        runCurrent()

        frames.deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        runCurrent()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
        coVerify { rig.patcher.remove("c1") }
        coVerify(exactly = 0) { rig.repo.refresh() }
    }

    @Test
    fun `conversation closed sheds its stars and removes the row`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        binder(frames, rig, stars)
        runCurrent()

        frames.closed.emit(ConversationClosedSocketEvent(conversationId = "c1", closedBy = "creator"))
        runCurrent()

        assertThat(stars.starred.value.items).isEmpty()
        coVerify { rig.patcher.remove("c1") }
    }

    @Test
    fun `only my own departure removes the conversation, another departure shrinks the roster`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val rig = rig()
            val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
            binder(frames, rig, stars)
            runCurrent()
            val other = ParticipantLeftEvent(conversationId = "c1", userId = "someone-else")

            frames.left.emit(other)
            runCurrent()
            assertThat(stars.starred.value.items).hasSize(1)
            coVerify(exactly = 0) { rig.patcher.remove(any()) }
            coVerify(exactly = 1) { rig.patcher.applyLeft(other) }

            frames.left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "me"))
            runCurrent()
            assertThat(stars.starred.value.items).isEmpty()
            coVerify(exactly = 1) { rig.patcher.remove("c1") }
        }

    @Test
    fun `being banned removes the conversation, another ban shrinks the roster`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val rig = rig()
            binder(frames, rig)
            runCurrent()
            val other = ParticipantBannedEvent(conversationId = "c1", userId = "x")

            frames.banned.emit(other)
            frames.banned.emit(ParticipantBannedEvent(conversationId = "c2", userId = "me"))
            runCurrent()

            coVerify(exactly = 1) { rig.patcher.applyBanned(other) }
            coVerify(exactly = 1) { rig.patcher.remove("c2") }
        }

    @Test
    fun `joined and unbanned members are routed to the patcher`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        binder(frames, rig)
        runCurrent()
        val joined = ParticipantJoinedEvent(conversationId = "c1", userId = "x")
        val unbanned = ParticipantUnbannedEvent(conversationId = "c1", userId = "y")

        frames.joined.emit(joined)
        frames.unbanned.emit(unbanned)
        runCurrent()

        coVerify { rig.patcher.applyJoined(joined) }
        coVerify { rig.patcher.applyUnbanned(unbanned) }
    }

    @Test
    fun `a restored conversation is fetched by id, not by rereading the list`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        binder(frames, rig)
        runCurrent()

        frames.restored.emit(ConversationRestoredSocketEvent(conversationId = "c9"))
        runCurrent()

        coVerify { rig.patcher.discover("c9") }
        coVerify(exactly = 0) { rig.repo.refresh() }
    }

    @Test
    fun `a failing patch never stops the lane`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        coEvery { rig.patcher.applyMessage(any()) } throws IllegalStateException("teardown")
        binder(frames, rig)
        runCurrent()
        val update = ConversationUpdatedSocketEvent(conversationId = "c1")

        frames.received.emit(ApiMessage(id = "m1", conversationId = "c1"))
        frames.updated.emit(update)
        runCurrent()

        coVerify(exactly = 1) { rig.patcher.applyUpdated(update) }
    }

    @Test
    fun `the first connection costs no reread, a reconnection catches up once`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val rig = rig()
        binder(frames, rig)
        runCurrent()

        frames.connection.value = SocketConnectionState.CONNECTED
        runCurrent()
        coVerify(exactly = 0) { rig.repo.refresh() }

        frames.connection.value = SocketConnectionState.CONNECTING
        runCurrent()
        frames.connection.value = SocketConnectionState.CONNECTED
        runCurrent()
        coVerify(exactly = 1) { rig.repo.refresh() }
    }
}
