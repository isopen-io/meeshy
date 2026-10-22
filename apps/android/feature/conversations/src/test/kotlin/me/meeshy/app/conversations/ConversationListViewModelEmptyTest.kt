package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import kotlinx.coroutines.CompletableDeferred
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.category.CategoryRepository
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.lock.ConversationLockStore
import me.meeshy.sdk.lock.InMemoryConversationLockStore
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationClosedSocketEvent
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationRestoredSocketEvent
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.ConversationUpdatedSocketEvent
import me.meeshy.sdk.model.UnreadUpdateEvent
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.status.StatusBarCache
import me.meeshy.sdk.status.StatusFeedMode
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListViewModelEmptyTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun repositoryReturning(
        stream: Flow<CacheResult<List<ApiConversation>>>,
    ): ConversationRepository = mockk<ConversationRepository>(relaxed = true).also {
        every { it.conversationsStream(any(), any()) } returns stream
    }

    private fun socketManager(
        conversationDeleted: MutableSharedFlow<ConversationDeletedSocketEvent> = MutableSharedFlow(),
        conversationRestored: MutableSharedFlow<ConversationRestoredSocketEvent> = MutableSharedFlow(),
        conversationClosed: MutableSharedFlow<ConversationClosedSocketEvent> = MutableSharedFlow(),
        participantLeft: MutableSharedFlow<ParticipantLeftEvent> = MutableSharedFlow(),
        userStatus: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
        presenceSnapshot: MutableSharedFlow<PresenceSnapshotEvent> = MutableSharedFlow(),
        unreadUpdated: MutableSharedFlow<UnreadUpdateEvent> = MutableSharedFlow(),
        messageReceived: MutableSharedFlow<ApiMessage> = MutableSharedFlow(),
        conversationUpdated: MutableSharedFlow<ConversationUpdatedSocketEvent> = MutableSharedFlow(),
        typingStarted: MutableSharedFlow<TypingEvent> = MutableSharedFlow(),
        typingStopped: MutableSharedFlow<TypingEvent> = MutableSharedFlow(),
    ): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { this@mockk.unreadUpdated } returns unreadUpdated
            every { this@mockk.messageReceived } returns messageReceived
            every { this@mockk.conversationUpdated } returns conversationUpdated
            every { this@mockk.conversationDeleted } returns conversationDeleted
            every { this@mockk.conversationRestored } returns conversationRestored
            every { this@mockk.conversationClosed } returns conversationClosed
            every { this@mockk.participantLeft } returns participantLeft
            every { this@mockk.userStatus } returns userStatus
            every { this@mockk.presenceSnapshot } returns presenceSnapshot
            every { this@mockk.typingStarted } returns typingStarted
            every { this@mockk.typingStopped } returns typingStopped
        }

    private fun typingPresenceRelay(
        forcedOnline: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
    ): TypingPresenceRelay =
        mockk<TypingPresenceRelay> {
            every { this@mockk.forcedOnline } returns forcedOnline
        }

    private fun connectionSocket(
        state: MutableStateFlow<SocketConnectionState> =
            MutableStateFlow(SocketConnectionState.DISCONNECTED),
    ): SocketManager = mockk<SocketManager> {
        every { connectionState } returns state
    }

    private fun session(userId: String? = null): SessionRepository = mockk<SessionRepository> {
        every { currentUser } returns
            MutableStateFlow(userId?.let { MeeshyUser(id = it, username = it) })
    }

    private val workManager: WorkManager = mockk(relaxed = true)

    private fun messageRepository(recent: List<LocalMessage> = emptyList()): MessageRepository =
        mockk<MessageRepository> {
            coEvery { recentMessages(any(), any()) } returns recent
        }

    private fun categoryRepo(
        categories: List<me.meeshy.sdk.model.CategoryOption> = emptyList(),
    ): CategoryRepository = mockk<CategoryRepository> {
        every { categoriesStream(any(), any()) } returns flowOf(categories)
    }

    private fun categorySocket(
        events: MutableSharedFlow<me.meeshy.sdk.model.CategoryEvent> = MutableSharedFlow(),
    ): me.meeshy.sdk.socket.CategorySocketManager = mockk<me.meeshy.sdk.socket.CategorySocketManager> {
        every { categoryEvents } returns events
    }

    private fun preferencesSocket(
        events: MutableSharedFlow<me.meeshy.sdk.model.UserPreferencesConversationUpdatedSocketData> =
            MutableSharedFlow(),
    ): me.meeshy.sdk.socket.PreferencesSocketManager =
        mockk<me.meeshy.sdk.socket.PreferencesSocketManager> {
            every { conversationPreferencesUpdated } returns events
        }

    private fun storyRepo(): me.meeshy.sdk.story.StoryRepository =
        mockk<me.meeshy.sdk.story.StoryRepository>(relaxed = true) {
            every { storiesStream(any(), any()) } returns kotlinx.coroutines.flow.emptyFlow()
        }

    private class FixedClock(private val now: Long = 0L) : CacheClock {
        override fun nowMillis(): Long = now
    }

    private fun statusBarCache(vararg entries: Pair<StatusFeedMode, List<StatusEntry>>): StatusBarCache =
        StatusBarCache(FixedClock()).apply {
            entries.forEach { (mode, statuses) -> save(mode, statuses) }
        }

    private fun status(userId: String, moodEmoji: String) =
        StatusEntry(id = "status-$userId", userId = userId, moodEmoji = moodEmoji)

    private fun viewModel(
        repo: ConversationRepository,
        connection: SocketManager = connectionSocket(),
        draftStore: ConversationDraftStore = InMemoryConversationDraftStore(),
        socket: MessageSocketManager = socketManager(),
        relay: TypingPresenceRelay = typingPresenceRelay(),
        starredStore: StarredMessagesStore = InMemoryStarredMessagesStore(),
        categoryRepository: CategoryRepository = categoryRepo(),
        categorySocketManager: me.meeshy.sdk.socket.CategorySocketManager = categorySocket(),
        preferencesSocketManager: me.meeshy.sdk.socket.PreferencesSocketManager = preferencesSocket(),
        session: SessionRepository = session(),
        messageRepo: MessageRepository = messageRepository(),
        lockStore: ConversationLockStore = InMemoryConversationLockStore(),
        storyRepository: me.meeshy.sdk.story.StoryRepository = storyRepo(),
        statusBarCache: StatusBarCache = statusBarCache(),
    ) = ConversationListViewModel(
        repo, messageRepo, socket, relay, workManager, draftStore, starredStore,
        categoryRepository, categorySocketManager, preferencesSocketManager, connection, session, lockStore,
        storyRepository, statusBarCache, io.mockk.mockk(relaxed = true),
    )

    @Test
    fun `retry after a cold sync failure forces a refresh and clears the error card`() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        var attempts = 0
        coEvery { repo.refresh() } coAnswers {
            attempts++
            if (attempts == 1) throw RuntimeException("Network unavailable")
        }
        val vm = viewModel(repo)
        advanceUntilIdle()
        vm.refresh()
        advanceUntilIdle()
        assertThat(ConversationListContent.of(vm.state.value))
            .isEqualTo(ConversationListContent.Error("Network unavailable"))

        vm.refresh()
        advanceUntilIdle()

        coVerify(exactly = 2) { repo.refresh() }
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun `a failed retry keeps the server message on the error card`() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        coEvery { repo.refresh() } throws RuntimeException("Server down")
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()
        vm.refresh()
        advanceUntilIdle()

        assertThat(ConversationListContent.of(vm.state.value))
            .isEqualTo(ConversationListContent.Error("Server down"))
    }

    @Test
    fun `a cached list is never replaced by the error card when a refresh fails`() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Stale(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.refresh() } throws RuntimeException("offline")
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertThat(ConversationListContent.of(vm.state.value)).isEqualTo(ConversationListContent.Populated)
    }
}
