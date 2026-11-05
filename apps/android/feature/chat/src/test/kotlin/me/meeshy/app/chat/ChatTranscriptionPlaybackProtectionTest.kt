package me.meeshy.app.chat

import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
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
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.reaction.OwnReactionWithdrawals
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/**
 * #16239 — l'hôte du fil transmet à la fiche Transcription la protection RÉELLE du message
 * ([me.meeshy.sdk.model.MessageTranscriptionFiche.playbackIsProtected]), jamais un `false` en dur.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatTranscriptionPlaybackProtectionTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun harness(encryptionMode: String?): ChatViewModel {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns flowOf(
            CacheResult.Fresh(
                listOf(
                    LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "vocal")),
                    LocalMessage(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "vocal", isViewOnce = true)),
                    LocalMessage(ApiMessage(id = "m3", conversationId = "c1", senderId = "other", content = "vocal", expiresAt = "2026-12-01T00:00:00Z")),
                ),
                ageMillis = 0,
            ),
        )
        coEvery { repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        coEvery { repo.setPinnedOptimistic(any(), any()) } returns true
        coEvery { repo.deleteOptimistic(any()) } returns true
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns
            MutableStateFlow(ApiConversation(id = "c1", type = "direct", encryptionMode = encryptionMode))
        every { conversations.conversationsStream(any(), any()) } returns flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "moi"))
        val reactions = mockk<ReactionRepository>(relaxed = true)
        coEvery { reactions.fetchDetails(any()) } returns NetworkResult.Failure(ApiError("offline"))
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
        val fileDownloader = mockk<FileAttachmentDownloader>(relaxed = true)
        every { fileDownloader.download(any(), any(), any()) } returns emptyFlow()
        val workManager = mockk<WorkManager>(relaxed = true)
        val hidden = InMemoryLocallyHiddenMessagesStore()
        val clock = object : CacheClock {
            override fun nowMillis(): Long = 1_000L
        }
        return ChatViewModel(
            repo,
            conversations,
            session,
            reactions,
            InMemoryEmojiUsageStore(),
            hidden,
            InMemoryStarredMessagesStore(),
            socket,
            workManager,
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
            ownReactionWithdrawals = OwnReactionWithdrawals(),
            outOfThreadSendGate = OutOfThreadSendGate { OutOfThreadAdmission.SEND },
            openConversations = io.mockk.mockk(relaxed = true),
        )
    }

    @Test
    fun `an ordinary message in a clear conversation plays its translated track unprotected`() = runTest(dispatcher) {
        val vm = harness(encryptionMode = null)
        advanceUntilIdle()

        assertThat(vm.hostActions().transcriptionPlaybackProtected("m1")).isFalse()
    }

    @Test
    fun `a view once or ephemeral message plays its translated track protected`() = runTest(dispatcher) {
        val vm = harness(encryptionMode = null)
        advanceUntilIdle()

        assertThat(vm.hostActions().transcriptionPlaybackProtected("m2")).isTrue()
        assertThat(vm.hostActions().transcriptionPlaybackProtected("m3")).isTrue()
    }

    @Test
    fun `a message the thread does not hold plays protected`() = runTest(dispatcher) {
        val vm = harness(encryptionMode = null)
        advanceUntilIdle()

        assertThat(vm.hostActions().transcriptionPlaybackProtected("absent")).isTrue()
    }

    @Test
    fun `an end to end conversation plays every translated track protected`() = runTest(dispatcher) {
        val vm = harness(encryptionMode = "e2ee")
        advanceUntilIdle()

        assertThat(vm.hostActions().transcriptionPlaybackProtected("m1")).isTrue()
    }
}
