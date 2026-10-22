package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.PreferencesSocketManager
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListRealtimeBinderTest {

    private class Frames {
        val unread = MutableSharedFlow<UnreadUpdateEvent>()
        val received = MutableSharedFlow<ApiMessage>()
        val updated = MutableSharedFlow<ConversationUpdatedSocketEvent>()
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val closed = MutableSharedFlow<ConversationClosedSocketEvent>()
        val left = MutableSharedFlow<ParticipantLeftEvent>()
    }

    private fun TestScope.binder(
        frames: Frames,
        repository: ConversationRepository,
        stars: InMemoryStarredMessagesStore = InMemoryStarredMessagesStore(),
        me: String? = "me",
    ): ConversationListRealtimeBinder = ConversationListRealtimeBinder(
        scope = backgroundScope,
        repository = repository,
        messageSocketManager = mockk<MessageSocketManager> {
            every { unreadUpdated } returns frames.unread
            every { messageReceived } returns frames.received
            every { conversationUpdated } returns frames.updated
            every { conversationDeleted } returns frames.deleted
            every { conversationRestored } returns MutableSharedFlow()
            every { conversationClosed } returns frames.closed
            every { participantLeft } returns frames.left
        },
        preferencesSocketManager = mockk<PreferencesSocketManager> {
            every { conversationPreferencesUpdated } returns
                MutableSharedFlow<UserPreferencesConversationUpdatedSocketData>()
        },
        starredStore = stars,
        currentUserId = { me },
    ).also { it.start() }

    private fun star(conversationId: String) =
        StarredMessage(messageId = "m-$conversationId", conversationId = conversationId)

    @Test
    fun `three frames for the same message trigger a single refresh`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val repo = mockk<ConversationRepository>(relaxed = true)
            binder(frames, repo)
            runCurrent()

            frames.received.emit(ApiMessage(id = "m1", conversationId = "c1"))
            frames.updated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
            frames.unread.emit(UnreadUpdateEvent(conversationId = "c1", unreadCount = 1))
            runCurrent()

            coVerify(exactly = 1) { repo.refresh() }
        }

    @Test
    fun `a frame arriving during an in-flight refresh leaves one tail refresh`() =
        runTest(StandardTestDispatcher()) {
            val frames = Frames()
            val gate = CompletableDeferred<Unit>()
            val repo = mockk<ConversationRepository>(relaxed = true)
            coEvery { repo.refresh() } coAnswers { gate.await() }
            binder(frames, repo)
            runCurrent()

            frames.received.emit(ApiMessage(id = "m1", conversationId = "c1"))
            runCurrent()
            frames.received.emit(ApiMessage(id = "m2", conversationId = "c1"))
            frames.received.emit(ApiMessage(id = "m3", conversationId = "c1"))
            runCurrent()
            coVerify(exactly = 1) { repo.refresh() }

            gate.complete(Unit)
            runCurrent()

            coVerify(exactly = 2) { repo.refresh() }
        }

    @Test
    fun `a lone frame at rest is served immediately`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val repo = mockk<ConversationRepository>(relaxed = true)
        binder(frames, repo)
        runCurrent()

        frames.updated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
        runCurrent()

        coVerify(exactly = 1) { repo.refresh() }
    }

    @Test
    fun `conversation deleted sheds its stars and refreshes`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val repo = mockk<ConversationRepository>(relaxed = true)
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"), star("c2"))))
        binder(frames, repo, stars)
        runCurrent()

        frames.deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        runCurrent()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
        coVerify { repo.refresh() }
    }

    @Test
    fun `conversation closed sheds its stars and refreshes`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val repo = mockk<ConversationRepository>(relaxed = true)
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        binder(frames, repo, stars)
        runCurrent()

        frames.closed.emit(ConversationClosedSocketEvent(conversationId = "c1", closedBy = "creator"))
        runCurrent()

        assertThat(stars.starred.value.items).isEmpty()
        coVerify { repo.refresh() }
    }

    @Test
    fun `only my own departure purges the conversation`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val repo = mockk<ConversationRepository>(relaxed = true)
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        binder(frames, repo, stars)
        runCurrent()

        frames.left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "someone-else"))
        runCurrent()
        assertThat(stars.starred.value.items).hasSize(1)
        coVerify(exactly = 0) { repo.refresh() }

        frames.left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "me"))
        runCurrent()
        assertThat(stars.starred.value.items).isEmpty()
        coVerify(exactly = 1) { repo.refresh() }
    }

    @Test
    fun `a failing refresh never escapes the pump`() = runTest(StandardTestDispatcher()) {
        val frames = Frames()
        val repo = mockk<ConversationRepository>(relaxed = true)
        coEvery { repo.refresh() } throws IllegalStateException("teardown")
        binder(frames, repo)
        runCurrent()

        frames.updated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
        runCurrent()
        frames.updated.emit(ConversationUpdatedSocketEvent(conversationId = "c1"))
        runCurrent()

        coVerify(exactly = 2) { repo.refresh() }
    }
}
