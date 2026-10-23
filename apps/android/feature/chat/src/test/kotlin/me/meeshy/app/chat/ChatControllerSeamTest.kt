package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryLocallyHiddenMessagesStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.InMemoryNetworkConditionMonitor
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * The extension point of the conversation screen: a lot contributes a [ChatController]
 * (a Hilt `@IntoSet` binding), the ViewModel attaches it to its screen, and the
 * controller keeps its state in its own flow — never in [ChatUiState].
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatControllerSeamTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class RecordingController : ChatController {
        var host: ChatControllerHost? = null
        var attachments = 0
        var detachments = 0

        /** The controller's own state: what a lot ships INSTEAD of a new [ChatUiState] field. */
        val ownState = MutableStateFlow("idle")

        override fun attach(host: ChatControllerHost) {
            attachments += 1
            this.host = host
        }

        override fun detach() {
            detachments += 1
        }
    }

    private class OtherController : ChatController {
        override fun attach(host: ChatControllerHost) = Unit
    }

    private class ExplodingController : ChatController {
        override fun attach(host: ChatControllerHost) = error("boom on attach")
        override fun detach() = error("boom on detach")
    }

    // --- the registry ---------------------------------------------------------------------------

    @Test
    fun `a screen host finds the controller its lot contributed by type`() {
        val recording = RecordingController()
        val controllers = ChatControllers(setOf(OtherController(), recording))

        assertThat(controllers.find<RecordingController>()).isSameInstanceAs(recording)
        assertThat(controllers.find(OtherController::class.java)).isNotNull()
    }

    @Test
    fun `asking for a controller no lot contributed yields nothing`() {
        val controllers = ChatControllers(setOf(OtherController()))

        assertThat(controllers.find<RecordingController>()).isNull()
        assertThat(ChatControllers(emptySet()).find<RecordingController>()).isNull()
    }

    @Test
    fun `a controller that throws while attaching or detaching never stops the others`() {
        val before = RecordingController()
        val after = RecordingController()
        val controllers = ChatControllers(linkedSetOf(before, ExplodingController(), after))
        val host = host()

        controllers.attachAll(host)
        controllers.detachAll()

        assertThat(before.attachments).isEqualTo(1)
        assertThat(after.attachments).isEqualTo(1)
        assertThat(before.detachments).isEqualTo(1)
        assertThat(after.detachments).isEqualTo(1)
    }

    // --- the host --------------------------------------------------------------------------------

    private fun host(
        flow: MutableStateFlow<ChatUiState> = MutableStateFlow(ChatUiState(conversationId = "c1")),
        messages: MutableStateFlow<List<LocalMessage>> = MutableStateFlow(emptyList()),
    ) = ChatScreenHost(
        conversationId = "c1",
        scope = CoroutineScope(dispatcher),
        state = ChatStateAccess(flow),
        messages = messages,
    )

    @Test
    fun `the host shows the screen state read-only and carries failures into its single error channel`() {
        val flow = MutableStateFlow(ChatUiState(conversationId = "c1", draft = "hello"))
        val host = host(flow)

        assertThat(host.conversationId).isEqualTo("c1")
        assertThat(host.uiState.value.draft).isEqualTo("hello")

        host.reportError("quota exceeded")

        assertThat(flow.value.errorMessage).isEqualTo("quota exceeded")
        assertThat(flow.value.copy(errorMessage = null)).isEqualTo(ChatUiState(conversationId = "c1", draft = "hello"))
        assertThat(host.uiState.value).isEqualTo(flow.value)
    }

    // --- wired into the ViewModel ---------------------------------------------------------------

    private fun viewModel(
        controllers: Set<ChatController>,
        stream: kotlinx.coroutines.flow.Flow<CacheResult<List<LocalMessage>>> =
            flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)),
    ): ChatViewModel {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns stream
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns MutableStateFlow(null)
        every { conversations.conversationsStream(any(), any()) } returns
            flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(null)
        val activeCalls = mockk<ActiveCallRepository>(relaxed = true)
        coEvery { activeCalls.activeCallFor(any()) } returns null
        val socket = mockk<MessageSocketManager> {
            every { messageReceived } returns MutableSharedFlow()
            every { messageEdited } returns MutableSharedFlow()
            every { messageDeleted } returns MutableSharedFlow()
            every { messageExpired } returns MutableSharedFlow()
            every { messagePinned } returns MutableSharedFlow()
            every { messageUnpinned } returns MutableSharedFlow()
            every { translationReceived } returns MutableSharedFlow()
            every { transcriptionReady } returns MutableSharedFlow()
            every { audioTranslationReady } returns MutableSharedFlow()
            every { typingStarted } returns MutableSharedFlow()
            every { typingStopped } returns MutableSharedFlow()
            every { reactionAdded } returns MutableSharedFlow()
            every { reactionRemoved } returns MutableSharedFlow()
            every { readStatusUpdated } returns MutableSharedFlow()
            every { liveLocationStarted } returns MutableSharedFlow()
            every { liveLocationUpdated } returns MutableSharedFlow()
            every { liveLocationStopped } returns MutableSharedFlow()
            every { userStatus } returns MutableSharedFlow()
            every { presenceSnapshot } returns MutableSharedFlow()
            justRun { emitTypingStart(any()) }
            justRun { emitTypingStop(any()) }
        }
        val relay = mockk<TypingPresenceRelay> { every { forcedOnline } returns MutableSharedFlow() }
        val fileDownloader = mockk<FileAttachmentDownloader>(relaxed = true)
        every { fileDownloader.download(any(), any(), any()) } returns emptyFlow()
        val clock = object : CacheClock {
            override fun nowMillis(): Long = 1_000L
        }
        return ChatViewModel(
            repo,
            conversations,
            session,
            mockk<ReactionRepository>(relaxed = true),
            InMemoryEmojiUsageStore(),
            InMemoryLocallyHiddenMessagesStore(),
            InMemoryStarredMessagesStore(),
            socket,
            relay,
            mockk<WorkManager>(relaxed = true),
            MeeshyConfig(),
            clock,
            InMemoryConversationDraftStore(),
            activeCalls,
            mockk<ReportRepository>(relaxed = true),
            mockk<MediaUploadQueue>(relaxed = true),
            mockk<MentionSearch>(relaxed = true),
            InMemoryAnonymousSessionStore(null),
            InMemoryPrivacyPreferencesStore(),
            InMemoryNetworkConditionMonitor(),
            fileDownloader,
            SavedStateHandle(mapOf(ChatViewModel.CONVERSATION_ID_ARG to "c1")),
            controllers,
        )
    }

    @Test
    fun `a contributed controller is attached once to the open conversation and found from the view model`() =
        runTest(dispatcher) {
            val recording = RecordingController()

            val vm = viewModel(setOf(recording))
            advanceUntilIdle()

            assertThat(recording.attachments).isEqualTo(1)
            assertThat(vm.controllers.find<RecordingController>()).isSameInstanceAs(recording)
            assertThat(recording.host?.conversationId).isEqualTo("c1")
        }

    @Test
    fun `the host a controller receives sees the live screen state and the cached window`() = runTest(dispatcher) {
        val recording = RecordingController()
        val stream = flowOf(
            CacheResult.Fresh(
                listOf(LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "yo"))),
                ageMillis = 0,
            ),
        )

        val vm = viewModel(setOf(recording), stream)
        advanceUntilIdle()
        val host = checkNotNull(recording.host)

        assertThat(host.messages.value.map { it.message.id }).containsExactly("m1")
        assertThat(host.uiState.value).isEqualTo(vm.state.value)
        host.reportError("late failure")
        assertThat(vm.state.value.errorMessage).isEqualTo("late failure")
    }

    @Test
    fun `a controller's own state never touches the screen state`() = runTest(dispatcher) {
        val recording = RecordingController()
        val vm = viewModel(setOf(recording))
        advanceUntilIdle()
        val before = vm.state.value

        recording.ownState.value = "busy"
        advanceUntilIdle()

        assertThat(vm.state.value).isEqualTo(before)
    }

    @Test
    fun `a view model with no contributed controller behaves exactly as before`() = runTest(dispatcher) {
        val vm = viewModel(emptySet())
        advanceUntilIdle()

        assertThat(vm.controllers.find<RecordingController>()).isNull()
        assertThat(vm.state.value.conversationId).isEqualTo("c1")
    }

    @Test
    fun `a controller that throws on attach does not break the conversation`() = runTest(dispatcher) {
        val healthy = RecordingController()

        val vm = viewModel(linkedSetOf(ExplodingController(), healthy))
        advanceUntilIdle()

        assertThat(healthy.attachments).isEqualTo(1)
        assertThat(vm.state.value.conversationId).isEqualTo("c1")
    }
}
