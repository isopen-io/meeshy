package me.meeshy.app.chat

import me.meeshy.sdk.outbox.OutOfThreadAdmission
import me.meeshy.sdk.outbox.OutOfThreadSendGate
import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
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
 * #13790 — dans une conversation chiffrée de bout en bout, réagir, épingler et supprimer pour tous n'ont AUCUN effet : ni
 * puce optimiste, ni ligne d'outbox, ni réveil de l'envoi. Défense en profondeur sous le menu : la bulle, la feuille « qui a
 * réagi » et le sélecteur d'emoji passent tous par le ViewModel. « Supprimer pour moi », lui, reste : il ne quitte pas l'appareil.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatPlainSignalGestureTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private class Harness(
        val vm: ChatViewModel,
        val repo: MessageRepository,
        val workManager: WorkManager,
        val hidden: InMemoryLocallyHiddenMessagesStore,
    )

    /** [sealedOwn] (#13804) : un message à moi écrit APRÈS l'activation, scellé (`m3`), à côté de `m1` écrit en clair avant elle. */
    private fun harness(encryptionMode: String?, sealedOwn: Boolean = false): Harness {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns flowOf(
            CacheResult.Fresh(
                listOfNotNull(
                    LocalMessage(ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "à moi")),
                    LocalMessage(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "à lui", pinnedAt = "2026-10-01T10:00:00Z")),
                    LocalMessage(
                        ApiMessage(id = "m3", conversationId = "c1", senderId = "me", content = "U2FsdGVkX1+opaque", isEncrypted = true, encryptionMode = "e2ee"),
                    ).takeIf { sealedOwn },
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
        val vm = ChatViewModel(
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
        )
        return Harness(vm, repo, workManager, hidden)
    }

    @Test
    fun `en bout en bout, reagir ne pose aucune puce et ne met rien en file`() = runTest(dispatcher) {
        val h = harness("e2ee")
        advanceUntilIdle()

        h.vm.onMessageLongPress("m2")
        h.vm.toggleReaction("m2", "🔥")
        h.vm.addReactionFromDetails("m2", "😢")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.toggleReactionOptimistic(any(), any(), any()) }
        assertThat(h.vm.state.value.ownReactions["m2"].orEmpty()).isEmpty()
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun `en bout en bout, le selecteur d'emoji ne s'ouvre pas`() = runTest(dispatcher) {
        val h = harness("e2ee")
        advanceUntilIdle()

        h.vm.openEmojiPicker("m2")

        assertThat(h.vm.state.value.emojiPickerMessageId).isNull()
    }

    @Test
    fun `en bout en bout, ni epingler ni desepingler ni supprimer pour tous un message scelle ne part`() = runTest(dispatcher) {
        val h = harness("e2ee", sealedOwn = true)
        advanceUntilIdle()

        h.vm.togglePin("m1")
        h.vm.togglePin("m2")
        h.vm.deleteForEveryone("m3")
        h.vm.deleteSelectionForEveryone(listOf("m3"))
        h.vm.deleteForEveryone("absent")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.setPinnedOptimistic(any(), any()) }
        coVerify(exactly = 0) { h.repo.deleteOptimistic(any()) }
        coVerify(exactly = 0) { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun `en bout en bout, supprimer pour moi reste local et ne touche pas le serveur`() = runTest(dispatcher) {
        val h = harness("e2ee")
        advanceUntilIdle()

        h.vm.deleteForMe("m2")
        advanceUntilIdle()

        assertThat(h.hidden.hidden.value.isHidden("m2")).isTrue()
        coVerify(exactly = 0) { h.repo.deleteOptimistic(any()) }
    }

    @Test
    fun `hors bout en bout, les memes gestes partent par l'outbox`() = runTest(dispatcher) {
        val h = harness(null)
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "🔥")
        h.vm.togglePin("m1")
        h.vm.deleteForEveryone("m1")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.toggleReactionOptimistic("m2", "🔥", isAdding = true) }
        coVerify(exactly = 1) { h.repo.setPinnedOptimistic("m1", pin = true) }
        coVerify(exactly = 1) { h.repo.deleteOptimistic("m1") }
    }

    @Test
    fun `en bout en bout, un message a moi ecrit en clair avant l'activation se supprime pour tous, comme la passerelle l'admet (#13804)`() = runTest(dispatcher) {
        val h = harness("e2ee", sealedOwn = true)
        advanceUntilIdle()

        h.vm.deleteSelectionForEveryone(listOf("m1", "m3"))
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.deleteOptimistic("m1") }
        coVerify(exactly = 0) { h.repo.deleteOptimistic("m3") }
    }
}
