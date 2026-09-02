package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
import io.mockk.slot
import io.mockk.verify
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.call.ActiveCallRepository
import me.meeshy.sdk.model.call.ActiveCallSession
import me.meeshy.sdk.model.call.ActiveCallMetadata
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryLocallyHiddenMessagesStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.chat.LocallyHiddenMessages
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.media.InMemoryNetworkConditionMonitor
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.NetworkCondition
import me.meeshy.sdk.model.SentimentLevel
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageAttachment
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.AnonymousSessionContext
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.session.InMemoryAnonymousSessionStore
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.EphemeralDuration
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.sdk.mention.MentionAutocompleteState
import me.meeshy.sdk.mention.MentionSearch
import me.meeshy.sdk.model.MentionCandidate
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.MessagePinnedEvent
import me.meeshy.sdk.model.AudioTranslationEvent
import me.meeshy.sdk.model.LiveLocationStartedEvent
import me.meeshy.sdk.model.LiveLocationStoppedEvent
import me.meeshy.sdk.model.LiveLocationUpdatedEvent
import me.meeshy.sdk.model.TranscriptionPayload
import me.meeshy.sdk.model.TranscriptionReadyEvent
import me.meeshy.sdk.model.TranslatedAudioPayload
import me.meeshy.sdk.model.TranslationEvent
import me.meeshy.sdk.model.MessageUnpinnedEvent
import me.meeshy.sdk.model.PresenceSnapshotEvent
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.UserStatusEvent
import me.meeshy.sdk.model.ReactionGroup
import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.model.ReactionUserDetail
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.ReadStatusSummary
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.model.TypingEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.model.report.ReportReason
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.report.ReportRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.TypingPresenceRelay
import me.meeshy.sdk.theme.accentHex
import me.meeshy.ui.component.bubble.DeliveryStatus
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatViewModelTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun synced(message: ApiMessage) = LocalMessage(message)

    private fun anonymousGuestSession(permissions: ParticipantPermissions) = AnonymousSessionContext(
        sessionToken = "guest-token",
        participantId = "p-guest",
        permissions = permissions,
        linkId = "link-1",
        conversationId = "c1",
    )

    private val reactionAdded = MutableSharedFlow<ReactionUpdateEvent>()
    private val reactionRemoved = MutableSharedFlow<ReactionUpdateEvent>()
    private val messageReceived = MutableSharedFlow<ApiMessage>()
    private val readStatusUpdated = MutableSharedFlow<ReadStatusUpdatedEvent>()
    private val typingStarted = MutableSharedFlow<TypingEvent>()
    private val typingStopped = MutableSharedFlow<TypingEvent>()
    private val messagePinned = MutableSharedFlow<MessagePinnedEvent>()
    private val messageUnpinned = MutableSharedFlow<MessageUnpinnedEvent>()
    private val translationReceived = MutableSharedFlow<TranslationEvent>()
    private val transcriptionReady = MutableSharedFlow<TranscriptionReadyEvent>()
    private val audioTranslationReady = MutableSharedFlow<AudioTranslationEvent>()
    private val liveLocationStarted = MutableSharedFlow<LiveLocationStartedEvent>()
    private val liveLocationUpdated = MutableSharedFlow<LiveLocationUpdatedEvent>()
    private val liveLocationStopped = MutableSharedFlow<LiveLocationStoppedEvent>()

    private fun socketManager(
        userStatus: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
        presenceSnapshot: MutableSharedFlow<PresenceSnapshotEvent> = MutableSharedFlow(),
    ): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { this@mockk.messageReceived } returns this@ChatViewModelTest.messageReceived
            every { messageEdited } returns MutableSharedFlow()
            every { messageDeleted } returns MutableSharedFlow()
            every { this@mockk.messagePinned } returns this@ChatViewModelTest.messagePinned
            every { this@mockk.messageUnpinned } returns this@ChatViewModelTest.messageUnpinned
            every { this@mockk.translationReceived } returns this@ChatViewModelTest.translationReceived
            every { this@mockk.transcriptionReady } returns this@ChatViewModelTest.transcriptionReady
            every { this@mockk.audioTranslationReady } returns this@ChatViewModelTest.audioTranslationReady
            every { this@mockk.typingStarted } returns this@ChatViewModelTest.typingStarted
            every { this@mockk.typingStopped } returns this@ChatViewModelTest.typingStopped
            every { this@mockk.reactionAdded } returns this@ChatViewModelTest.reactionAdded
            every { this@mockk.reactionRemoved } returns this@ChatViewModelTest.reactionRemoved
            every { this@mockk.readStatusUpdated } returns this@ChatViewModelTest.readStatusUpdated
            every { this@mockk.liveLocationStarted } returns this@ChatViewModelTest.liveLocationStarted
            every { this@mockk.liveLocationUpdated } returns this@ChatViewModelTest.liveLocationUpdated
            every { this@mockk.liveLocationStopped } returns this@ChatViewModelTest.liveLocationStopped
            every { this@mockk.userStatus } returns userStatus
            every { this@mockk.presenceSnapshot } returns presenceSnapshot
            justRun { emitTypingStart(any()) }
            justRun { emitTypingStop(any()) }
        }

    private fun typingPresenceRelay(
        forcedOnline: MutableSharedFlow<UserStatusEvent> = MutableSharedFlow(),
    ): TypingPresenceRelay =
        mockk<TypingPresenceRelay> {
            every { this@mockk.forcedOnline } returns forcedOnline
        }

    private data class Harness(
        val vm: ChatViewModel,
        val repo: MessageRepository,
        val workManager: WorkManager,
        val reactions: ReactionRepository,
        val conversations: ConversationRepository,
        val socket: MessageSocketManager,
        val emojiUsage: InMemoryEmojiUsageStore,
        val locallyHidden: InMemoryLocallyHiddenMessagesStore,
        val starred: InMemoryStarredMessagesStore,
        val draftStore: InMemoryConversationDraftStore,
        val activeCallRepo: ActiveCallRepository,
        val reportRepo: ReportRepository,
        val mediaQueue: MediaUploadQueue,
        val mentionSearch: MentionSearch,
        val fileDownloader: FileAttachmentDownloader,
    )

    private fun viewModel(
        stream: Flow<CacheResult<List<LocalMessage>>>,
        currentUser: MeeshyUser? = null,
    ): Triple<ChatViewModel, MessageRepository, WorkManager> {
        val harness = harness(stream, currentUser)
        return Triple(harness.vm, harness.repo, harness.workManager)
    }

    private fun harness(
        stream: Flow<CacheResult<List<LocalMessage>>>,
        currentUser: MeeshyUser? = null,
        conversation: ApiConversation? = null,
        nowMillis: Long = FIXED_NOW,
        hidden: LocallyHiddenMessages = LocallyHiddenMessages(),
        drafts: Map<String, ConversationDraft> = emptyMap(),
        targetConversations: List<ApiConversation> = emptyList(),
        activeCall: ActiveCallSession? = null,
        mentionSearch: MentionSearch = FakeMentionSearch(),
        anonymousSession: AnonymousSessionContext? = null,
        showReadReceipts: Boolean = true,
        offline: Boolean = false,
        initialDraftArg: String? = null,
        socket: MessageSocketManager = socketManager(),
        relay: TypingPresenceRelay = typingPresenceRelay(),
    ): Harness {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns stream
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns MutableStateFlow(conversation)
        every { conversations.conversationsStream(any(), any()) } returns
            flowOf(CacheResult.Fresh(targetConversations, ageMillis = 0))
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(currentUser)
        val reactions = mockk<ReactionRepository>(relaxed = true)
        coEvery { reactions.fetchDetails(any()) } returns
            NetworkResult.Failure(ApiError("offline"))
        val workManager = mockk<WorkManager>(relaxed = true)
        val activeCallRepo = mockk<ActiveCallRepository>(relaxed = true)
        coEvery { activeCallRepo.activeCallFor(any()) } returns activeCall
        val reportRepo = mockk<ReportRepository>(relaxed = true)
        val mediaQueue = mockk<MediaUploadQueue>(relaxed = true)
        coEvery { mediaQueue.enqueue(any()) } returns "upload-cmid"
        val anonymousStore = InMemoryAnonymousSessionStore(anonymousSession)
        val privacyStore = InMemoryPrivacyPreferencesStore(
            PrivacyPreferences(showReadReceipts = showReadReceipts),
        )
        val networkMonitor = InMemoryNetworkConditionMonitor(
            initial = if (offline) NetworkCondition.OFFLINE else NetworkCondition.WIFI,
        )
        val fileDownloader = mockk<FileAttachmentDownloader>(relaxed = true)
        every { fileDownloader.download(any(), any(), any()) } returns emptyFlow()
        val handle = SavedStateHandle(
            buildMap {
                put(ChatViewModel.CONVERSATION_ID_ARG, "c1")
                if (initialDraftArg != null) put(ChatViewModel.DRAFT_ARG, initialDraftArg)
            },
        )
        val emojiUsage = InMemoryEmojiUsageStore()
        val locallyHidden = InMemoryLocallyHiddenMessagesStore(hidden)
        val starred = InMemoryStarredMessagesStore()
        val draftStore = InMemoryConversationDraftStore(drafts)
        val fixedNow = nowMillis
        val clock = object : CacheClock {
            override fun nowMillis(): Long = fixedNow
        }
        return Harness(
            ChatViewModel(
                repo,
                conversations,
                session,
                reactions,
                emojiUsage,
                locallyHidden,
                starred,
                socket,
                relay,
                workManager,
                MeeshyConfig(),
                clock,
                draftStore,
                activeCallRepo,
                reportRepo,
                mediaQueue,
                mentionSearch,
                anonymousStore,
                privacyStore,
                networkMonitor,
                fileDownloader,
                handle,
            ),
            repo,
            workManager,
            reactions,
            conversations,
            socket,
            emojiUsage,
            locallyHidden,
            starred,
            draftStore,
            activeCallRepo,
            reportRepo,
            mediaQueue,
            mentionSearch,
            fileDownloader,
        )
    }

    @Test
    fun opening_a_conversation_marks_it_read_and_schedules_the_flush() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.conversations.markReadOptimistic("c1") } returns true
        advanceUntilIdle()

        coVerify(exactly = 1) { h.conversations.markReadOptimistic("c1") }
        coVerify(atLeast = 1) { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun an_unread_conversation_marks_the_first_unread_message() = runTest(dispatcher) {
        val h = harness(incomingStream(), currentUser = me, conversation = unreadConversation(unread = 2))

        advanceUntilIdle()

        // 3 loaded messages, 2 unread → the boundary is the message at index size-2.
        assertThat(h.vm.state.value.firstUnreadMessageId).isEqualTo("m2")
    }

    @Test
    fun a_fully_read_conversation_marks_no_unread_message() = runTest(dispatcher) {
        val h = harness(incomingStream(), currentUser = me, conversation = unreadConversation(unread = 0))

        advanceUntilIdle()

        assertThat(h.vm.state.value.firstUnreadMessageId).isNull()
    }

    @Test
    fun the_unread_boundary_stays_unresolved_while_the_message_window_is_empty() = runTest(dispatcher) {
        // The unread count is known, but no messages have loaded: the latch must
        // not settle (an empty window has no boundary to place, and the open
        // scroll must not fire against an empty list).
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = unreadConversation(unread = 2))

        advanceUntilIdle()

        assertThat(h.vm.state.value.unreadBoundaryResolved).isFalse()
        assertThat(h.vm.state.value.firstUnreadMessageId).isNull()
    }

    @Test
    fun an_unread_conversation_resolves_the_boundary_once_the_latch_runs() = runTest(dispatcher) {
        val h = harness(incomingStream(), currentUser = me, conversation = unreadConversation(unread = 2))

        advanceUntilIdle()

        assertThat(h.vm.state.value.unreadBoundaryResolved).isTrue()
        assertThat(h.vm.state.value.firstUnreadMessageId).isEqualTo("m2")
    }

    @Test
    fun a_fully_read_conversation_still_resolves_the_boundary_to_none() = runTest(dispatcher) {
        val h = harness(incomingStream(), currentUser = me, conversation = unreadConversation(unread = 0))

        advanceUntilIdle()

        assertThat(h.vm.state.value.unreadBoundaryResolved).isTrue()
        assertThat(h.vm.state.value.firstUnreadMessageId).isNull()
    }

    private fun unreadConversation(unread: Int) = ApiConversation(
        id = "c1",
        type = "group",
        title = "Squad",
        unreadCount = unread,
        participants = listOf(
            ApiParticipant(id = "p0", userId = "me", username = "atabeth"),
            ApiParticipant(id = "p1", userId = "other", username = "bob"),
        ),
    )

    private fun incomingStream() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "a")),
                synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "b")),
                synced(ApiMessage(id = "m3", conversationId = "c1", senderId = "other", content = "c")),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun probing_on_open_surfaces_a_server_side_active_call() = runTest(dispatcher) {
        val session = ActiveCallSession(
            id = "call-live-1",
            conversationId = "c1",
            mode = "p2p",
            status = "active",
            metadata = ActiveCallMetadata(type = "video"),
        )
        val h = harness(syncedConversation(), currentUser = me, activeCall = session)

        advanceUntilIdle()

        assertThat(h.vm.state.value.activeCall?.id).isEqualTo("call-live-1")
        assertThat(h.vm.state.value.activeCall?.isVideo).isTrue()
    }

    @Test
    fun no_active_call_leaves_the_rejoin_state_empty() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, activeCall = null)

        advanceUntilIdle()

        assertThat(h.vm.state.value.activeCall).isNull()
    }

    @Test
    fun refreshActiveCall_re_probes_after_a_call_ends() = runTest(dispatcher) {
        val session = ActiveCallSession(
            id = "call-live-2",
            conversationId = "c1",
            mode = "p2p",
            status = "active",
        )
        val h = harness(syncedConversation(), currentUser = me, activeCall = session)
        advanceUntilIdle()
        assertThat(h.vm.state.value.activeCall).isNotNull()

        // The call ended server-side; a resume re-probe must clear the pill.
        coEvery { h.activeCallRepo.activeCallFor(any()) } returns null
        h.vm.refreshActiveCall()
        advanceUntilIdle()

        assertThat(h.vm.state.value.activeCall).isNull()
    }

    @Test
    fun a_registered_member_with_no_anonymous_session_keeps_the_full_composer() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, anonymousSession = null)

        advanceUntilIdle()

        val affordances = h.vm.state.value.composerAffordances
        assertThat(h.vm.state.value.composerPermissions).isNull()
        assertThat(affordances.isReadOnly).isFalse()
        assertThat(affordances.showsAttachmentLadder).isTrue()
        assertThat(affordances.canSendAudios).isTrue()
    }

    @Test
    fun a_share_link_guest_gates_the_composer_to_its_hardened_permissions() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            anonymousSession = anonymousGuestSession(ParticipantPermissions.defaultAnonymous),
        )

        advanceUntilIdle()

        val affordances = h.vm.state.value.composerAffordances
        assertThat(h.vm.state.value.composerPermissions).isEqualTo(ParticipantPermissions.defaultAnonymous)
        // defaultAnonymous: text + images only, everything else denied.
        assertThat(affordances.isReadOnly).isFalse()
        assertThat(affordances.canSendImages).isTrue()
        assertThat(affordances.showsAttachmentLadder).isTrue()
        assertThat(affordances.canSendAudios).isFalse()
        assertThat(affordances.canSendVideos).isFalse()
        assertThat(affordances.canSendLocations).isFalse()
    }

    @Test
    fun a_muted_guest_makes_the_composer_read_only() = runTest(dispatcher) {
        val muted = ParticipantPermissions(
            canSendMessages = false,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = false,
        )
        val h = harness(
            syncedConversation(),
            currentUser = me,
            anonymousSession = anonymousGuestSession(muted),
        )

        advanceUntilIdle()

        val affordances = h.vm.state.value.composerAffordances
        assertThat(affordances.isReadOnly).isTrue()
        assertThat(affordances.showsAttachmentLadder).isFalse()
    }

    // MARK: - Slow mode (composer cooldown)

    private fun slowConversation(role: String? = "member", seconds: Int? = 30) = ApiConversation(
        id = "c1",
        type = "group",
        title = "Squad",
        slowModeSeconds = seconds,
        participants = listOf(
            ApiParticipant(id = "p0", userId = "me", username = "atabeth", role = role),
            ApiParticipant(id = "p1", userId = "u1", username = "bob"),
        ),
    )

    @Test
    fun the_conversation_slow_mode_interval_populates_the_composer_state() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(seconds = 30))

        advanceUntilIdle()

        assertThat(h.vm.state.value.slowModeSeconds).isEqualTo(30)
        assertThat(h.vm.state.value.slowModeExempt).isFalse()
        // Never sent yet → active but immediately sendable.
        val posture = h.vm.state.value.slowModeState(FIXED_NOW)
        assertThat(posture.isActive).isTrue()
        assertThat(posture.canSend).isTrue()
        assertThat(posture.remainingSeconds).isEqualTo(0)
    }

    @Test
    fun sending_under_slow_mode_records_the_send_and_blocks_an_immediate_resend() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(seconds = 30))
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.onDraftChange("hello")
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEmpty()
        assertThat(h.vm.state.value.lastSelfSentAtMillis).isEqualTo(FIXED_NOW)
        val posture = h.vm.state.value.slowModeState(FIXED_NOW)
        assertThat(posture.canSend).isFalse()
        assertThat(posture.remainingSeconds).isEqualTo(30)

        // A second send while the cooldown runs is refused — the draft is kept.
        h.vm.onDraftChange("again")
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("again")
        coVerify(exactly = 1) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    @Test
    fun an_exempt_moderator_is_never_throttled_between_sends() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(role = "admin", seconds = 30))
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        assertThat(h.vm.state.value.slowModeExempt).isTrue()
        assertThat(h.vm.state.value.slowModeState(FIXED_NOW).isActive).isFalse()

        h.vm.onDraftChange("one")
        h.vm.send()
        advanceUntilIdle()
        h.vm.onDraftChange("two")
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEmpty()
        coVerify(exactly = 2) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    @Test
    fun slow_mode_off_does_not_throttle_consecutive_sends() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(seconds = null))
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        assertThat(h.vm.state.value.slowModeSeconds).isNull()
        assertThat(h.vm.state.value.slowModeState(FIXED_NOW).canSend).isTrue()

        h.vm.onDraftChange("one")
        h.vm.send()
        advanceUntilIdle()
        h.vm.onDraftChange("two")
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 2) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    @Test
    fun an_incoming_message_in_the_open_conversation_is_marked_read() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.conversations.markReadOptimistic("c1") } returns true
        advanceUntilIdle()

        messageReceived.emit(ApiMessage(id = "m9", conversationId = "c1", content = "yo"))
        advanceUntilIdle()

        coVerify(exactly = 2) { h.conversations.markReadOptimistic("c1") }
    }

    @Test
    fun an_incoming_message_elsewhere_does_not_mark_this_conversation_read() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.conversations.markReadOptimistic(any()) } returns true
        advanceUntilIdle()

        messageReceived.emit(ApiMessage(id = "m9", conversationId = "other", content = "yo"))
        advanceUntilIdle()

        coVerify(exactly = 1) { h.conversations.markReadOptimistic(any()) }
    }

    @Test
    fun a_live_location_started_event_surfaces_a_badge() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        liveLocationStarted.emit(
            LiveLocationStartedEvent(conversationId = "c1", userId = "u2", username = "Ada", durationMinutes = 30),
        )
        advanceUntilIdle()

        val badges = h.vm.state.value.liveLocationBadges
        assertThat(badges).hasSize(1)
        assertThat(badges.first().username).isEqualTo("Ada")
        assertThat(badges.first().expiresAtMillis).isEqualTo(FIXED_NOW + 30 * 60_000L)
    }

    @Test
    fun a_live_location_started_event_in_another_conversation_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        liveLocationStarted.emit(
            LiveLocationStartedEvent(conversationId = "other", userId = "u2", username = "Ada", durationMinutes = 30),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.liveLocationBadges).isEmpty()
    }

    @Test
    fun a_live_location_updated_event_moves_the_existing_badge() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()
        liveLocationStarted.emit(
            LiveLocationStartedEvent(conversationId = "c1", userId = "u2", username = "Ada", latitude = 1.0, durationMinutes = 30),
        )
        advanceUntilIdle()

        liveLocationUpdated.emit(
            LiveLocationUpdatedEvent(conversationId = "c1", userId = "u2", latitude = 5.0, longitude = 6.0),
        )
        advanceUntilIdle()

        val badge = h.vm.state.value.liveLocationBadges.single()
        assertThat(badge.latitude).isEqualTo(5.0)
        assertThat(badge.longitude).isEqualTo(6.0)
    }

    @Test
    fun a_live_location_stopped_event_removes_the_badge() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()
        liveLocationStarted.emit(
            LiveLocationStartedEvent(conversationId = "c1", userId = "u2", username = "Ada", durationMinutes = 30),
        )
        advanceUntilIdle()

        liveLocationStopped.emit(LiveLocationStoppedEvent(conversationId = "c1", userId = "u2"))
        advanceUntilIdle()

        assertThat(h.vm.state.value.liveLocationBadges).isEmpty()
    }

    @Test
    fun fresh_result_populates_message_bubbles() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            flowOf(
                CacheResult.Fresh(
                    listOf(synced(ApiMessage(id = "m1", conversationId = "c1", content = "hi"))),
                    ageMillis = 0,
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.messages).hasSize(1)
        assertThat(vm.state.value.messages.single().text).isEqualTo("hi")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun own_messages_are_outgoing_once_the_session_is_known() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            stream = flowOf(
                CacheResult.Fresh(
                    listOf(
                        synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "mine")),
                        synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "theirs")),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = MeeshyUser(id = "me", username = "atabeth"),
        )
        advanceUntilIdle()

        val bubbles = vm.state.value.messages
        assertThat(bubbles.single { it.messageId == "m1" }.isOutgoing).isTrue()
        assertThat(bubbles.single { it.messageId == "m2" }.isOutgoing).isFalse()
    }

    @Test
    fun sending_and_failed_bubbles_surface_their_delivery_status() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            stream = flowOf(
                CacheResult.Fresh(
                    listOf(
                        LocalMessage(
                            ApiMessage(id = "cmid_a", conversationId = "c1", senderId = "me", content = "pending"),
                            LocalSendState.SENDING,
                        ),
                        LocalMessage(
                            ApiMessage(id = "cmid_b", conversationId = "c1", senderId = "me", content = "broken"),
                            LocalSendState.FAILED,
                        ),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = MeeshyUser(id = "me", username = "atabeth"),
        )
        advanceUntilIdle()

        val bubbles = vm.state.value.messages
        assertThat(bubbles.single { it.messageId == "cmid_a" }.deliveryStatus)
            .isEqualTo(DeliveryStatus.Pending)
        assertThat(bubbles.single { it.messageId == "cmid_b" }.deliveryStatus)
            .isEqualTo(DeliveryStatus.Failed)
    }

    @Test
    fun a_pending_bubble_shows_the_offline_hourglass_while_the_device_is_offline() = runTest(dispatcher) {
        val h = harness(
            stream = flowOf(
                CacheResult.Fresh(
                    listOf(
                        LocalMessage(
                            ApiMessage(id = "cmid_a", conversationId = "c1", senderId = "me", content = "pending"),
                            LocalSendState.SENDING,
                        ),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = MeeshyUser(id = "me", username = "atabeth"),
            offline = true,
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.single { it.messageId == "cmid_a" }.deliveryStatus)
            .isEqualTo(DeliveryStatus.QueuedOffline)
    }

    @Test
    fun state_isOffline_mirrors_the_same_network_reading_that_drives_the_pending_hourglass() = runTest(dispatcher) {
        val h = harness(stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)), offline = true)
        advanceUntilIdle()

        assertThat(h.vm.state.value.isOffline).isTrue()
    }

    @Test
    fun state_isOffline_is_false_while_online() = runTest(dispatcher) {
        val h = harness(stream = flowOf(CacheResult.Fresh(emptyList(), ageMillis = 0)), offline = false)
        advanceUntilIdle()

        assertThat(h.vm.state.value.isOffline).isFalse()
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
    }

    @Test
    fun draft_change_updates_state_and_gates_sending() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        assertThat(vm.state.value.canSend).isFalse()

        vm.onDraftChange("hello")

        assertThat(vm.state.value.draft).isEqualTo("hello")
        assertThat(vm.state.value.canSend).isTrue()
    }

    @Test
    fun a_large_paste_is_captured_as_a_clipboard_attachment_and_clears_the_draft() =
        runTest(dispatcher) {
            val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
            advanceUntilIdle()

            val pasted = "a".repeat(2_500)
            vm.onDraftChange(pasted)

            assertThat(vm.state.value.draft).isEmpty()
            val clip = vm.state.value.clipboardContent
            assertThat(clip).isNotNull()
            assertThat(clip!!.text).isEqualTo(pasted)
            assertThat(clip.charCount).isEqualTo(2_500)
            assertThat(clip.createdAtMillis).isEqualTo(FIXED_NOW)
        }

    @Test
    fun ordinary_typing_does_not_capture_a_clipboard_attachment() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("just typing along")

        assertThat(vm.state.value.draft).isEqualTo("just typing along")
        assertThat(vm.state.value.clipboardContent).isNull()
    }

    @Test
    fun composer_sentiment_is_null_for_a_blank_draft() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        assertThat(vm.state.value.composerSentiment).isNull()
    }

    @Test
    fun composer_sentiment_reflects_positive_typing() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("i love this amazing day")

        assertThat(vm.state.value.composerSentiment).isEqualTo(SentimentLevel.VERY_POSITIVE)
    }

    @Test
    fun composer_sentiment_reflects_negative_typing() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("this is awful and horrible")

        assertThat(vm.state.value.composerSentiment).isEqualTo(SentimentLevel.NEGATIVE)
    }

    @Test
    fun composer_sentiment_is_neutral_for_wordless_sentiment_text() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("meeting at noon today")

        assertThat(vm.state.value.composerSentiment).isEqualTo(SentimentLevel.NEUTRAL)
    }

    @Test
    fun composer_sentiment_clears_when_the_draft_is_emptied() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        vm.onDraftChange("i love this")
        assertThat(vm.state.value.composerSentiment).isNotNull()

        vm.onDraftChange("")

        assertThat(vm.state.value.composerSentiment).isNull()
    }

    @Test
    fun composer_language_pill_follows_the_detected_language_of_the_draft() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("Hola, ¿cómo estás? ¿Qué tal todo por allá?")

        assertThat(vm.state.value.composerLanguageCode).isEqualTo("es")
    }

    @Test
    fun composer_language_pill_seeds_from_the_users_resolved_language_before_typing() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", regionalLanguage = "de")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user, conversation = unreadConversation(unread = 0))
        advanceUntilIdle()

        assertThat(h.vm.state.value.composerLanguageCode).isEqualTo("de")
    }

    @Test
    fun picking_a_composer_language_overrides_live_detection() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        vm.onDraftChange("Hola, ¿cómo estás? ¿Qué tal todo por allá?")
        assertThat(vm.state.value.composerLanguageCode).isEqualTo("es")

        vm.onComposerLanguagePicked("de")

        // The manual pick wins and freezes detection — typing French no longer flips it.
        vm.onDraftChange("Bonjour, comment allez-vous aujourd'hui ?")
        assertThat(vm.state.value.composerLanguageCode).isEqualTo("de")
    }

    @Test
    fun a_manual_language_pick_stamps_the_outgoing_message_over_detection() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        // French user typing Spanish, but they explicitly pick German: the pick wins.
        vm.onDraftChange("Hola, ¿cómo estás? ¿Qué tal todo por allá?")
        vm.onComposerLanguagePicked("de")
        vm.send()
        advanceUntilIdle()

        coVerify {
            repo.sendOptimistic(
                "c1",
                "Hola, ¿cómo estás? ¿Qué tal todo por allá?",
                "de",
                user,
                null,
            )
        }
    }

    @Test
    fun sending_resets_the_composer_language_to_the_seed() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()
        vm.onDraftChange("Hola, ¿cómo estás? ¿Qué tal todo por allá?")
        vm.onComposerLanguagePicked("de")

        vm.send()
        advanceUntilIdle()

        assertThat(vm.state.value.composerLanguageCode).isEqualTo("fr")
    }

    @Test
    fun removing_a_captured_clipboard_attachment_clears_it() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()
        vm.onDraftChange("a".repeat(2_500))
        assertThat(vm.state.value.clipboardContent).isNotNull()

        vm.removeClipboardContent()

        assertThat(vm.state.value.clipboardContent).isNull()
    }

    @Test
    fun a_captured_clipboard_makes_the_composer_sendable_with_a_blank_draft() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.onDraftChange("a".repeat(2_500))

        assertThat(vm.state.value.draft).isEmpty()
        assertThat(vm.state.value.canSend).isTrue()
    }

    @Test
    fun sending_a_captured_clipboard_uploads_it_and_sends_a_file_message() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        val vm = h.vm
        advanceUntilIdle()
        val pasted = "a".repeat(2_500)
        vm.onDraftChange(pasted)

        vm.send()
        advanceUntilIdle()

        assertThat(vm.state.value.clipboardContent).isNull()
        val itemSlot = slot<MediaUploadItem>()
        coVerify(exactly = 1) { h.mediaQueue.enqueue(capture(itemSlot)) }
        assertThat(String(itemSlot.captured.bytes, Charsets.UTF_8)).isEqualTo(pasted)
        assertThat(itemSlot.captured.mimeType).isEqualTo("text/plain")
        coVerify(exactly = 1) {
            h.repo.sendOptimistic(
                conversationId = eq("c1"),
                content = eq(""),
                originalLanguage = any(),
                sender = eq(user),
                replyToId = any(),
                effects = any(),
                messageType = eq("file"),
                attachmentUploadCmids = eq(listOf("upload-cmid")),
                attachments = any(),
            )
        }
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun sending_a_clipboard_alongside_typed_text_keeps_the_text_as_the_body() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        val vm = h.vm
        advanceUntilIdle()
        vm.onDraftChange("a".repeat(2_500))
        vm.onDraftChange("see attached")

        vm.send()
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.repo.sendOptimistic(
                conversationId = eq("c1"),
                content = eq("see attached"),
                originalLanguage = any(),
                sender = eq(user),
                replyToId = any(),
                effects = any(),
                messageType = eq("file"),
                attachmentUploadCmids = eq(listOf("upload-cmid")),
                attachments = any(),
            )
        }
    }

    @Test
    fun sending_a_picked_file_uploads_it_and_sends_a_typed_message() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.sendFileAttachment("PDFBYTES".toByteArray(), "report.pdf", declaredMimeType = null)
        advanceUntilIdle()

        val itemSlot = slot<MediaUploadItem>()
        coVerify(exactly = 1) { h.mediaQueue.enqueue(capture(itemSlot)) }
        assertThat(itemSlot.captured.fileName).isEqualTo("report.pdf")
        assertThat(itemSlot.captured.mimeType).isEqualTo("application/pdf")
        val attachSlot = slot<List<ApiMessageAttachment>>()
        coVerify(exactly = 1) {
            h.repo.sendOptimistic(
                conversationId = eq("c1"),
                content = eq(""),
                originalLanguage = any(),
                sender = eq(user),
                replyToId = any(),
                effects = any(),
                messageType = eq("file"),
                attachmentUploadCmids = eq(listOf("upload-cmid")),
                attachments = capture(attachSlot),
            )
        }
        val attachment = attachSlot.captured.single()
        assertThat(attachment.id).isEqualTo("upload-cmid")
        assertThat(attachment.originalName).isEqualTo("report.pdf")
        assertThat(attachment.mimeType).isEqualTo("application/pdf")
        assertThat(attachment.fileSize).isEqualTo(8)
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun a_picked_image_is_typed_as_an_image_message() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.sendFileAttachment("PNG".toByteArray(), "avatar.png", declaredMimeType = "image/png")
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.repo.sendOptimistic(
                conversationId = any(),
                content = any(),
                originalLanguage = any(),
                sender = any(),
                replyToId = any(),
                effects = any(),
                messageType = eq("image"),
                attachmentUploadCmids = any(),
                attachments = any(),
            )
        }
    }

    @Test
    fun a_picked_file_keeps_typed_draft_text_as_the_body_and_clears_the_composer() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()
        h.vm.onDraftChange("see the deck")

        h.vm.sendFileAttachment("PPT".toByteArray(), "deck.pptx", declaredMimeType = null)
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEmpty()
        coVerify(exactly = 1) {
            h.repo.sendOptimistic(
                conversationId = any(),
                content = eq("see the deck"),
                originalLanguage = any(),
                sender = any(),
                replyToId = any(),
                effects = any(),
                messageType = any(),
                attachmentUploadCmids = any(),
                attachments = any(),
            )
        }
    }

    @Test
    fun a_picked_files_octet_stream_declared_type_is_resolved_from_the_filename() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.sendFileAttachment(
            "M4V".toByteArray(),
            "clip.mp4",
            declaredMimeType = "application/octet-stream",
        )
        advanceUntilIdle()

        val itemSlot = slot<MediaUploadItem>()
        coVerify(exactly = 1) { h.mediaQueue.enqueue(capture(itemSlot)) }
        assertThat(itemSlot.captured.mimeType).isEqualTo("video/mp4")
    }

    @Test
    fun a_picked_file_with_a_blank_name_falls_back_to_a_default_name() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.sendFileAttachment("X".toByteArray(), "   ", declaredMimeType = "application/pdf")
        advanceUntilIdle()

        val itemSlot = slot<MediaUploadItem>()
        coVerify(exactly = 1) { h.mediaQueue.enqueue(capture(itemSlot)) }
        assertThat(itemSlot.captured.fileName).isEqualTo("attachment")
    }

    @Test
    fun an_empty_pick_is_a_no_op() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.sendFileAttachment(ByteArray(0), "empty.pdf", declaredMimeType = "application/pdf")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any()) }
        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    // MARK: - unified send gate across every send path

    @Test
    fun a_picked_file_under_slow_mode_records_the_cooldown_and_blocks_an_immediate_second_file() =
        runTest(dispatcher) {
            val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(seconds = 30))
            advanceUntilIdle()

            h.vm.sendFileAttachment("PDF".toByteArray(), "one.pdf", declaredMimeType = "application/pdf")
            advanceUntilIdle()

            // The delivered attachment starts the cooldown, exactly like a text send.
            assertThat(h.vm.state.value.lastSelfSentAtMillis).isEqualTo(FIXED_NOW)
            assertThat(h.vm.state.value.slowModeState(FIXED_NOW).canSend).isFalse()

            // A second pick while the cooldown runs never leaves the composer.
            h.vm.sendFileAttachment("PDF2".toByteArray(), "two.pdf", declaredMimeType = "application/pdf")
            advanceUntilIdle()

            coVerify(exactly = 1) { h.mediaQueue.enqueue(any()) }
        }

    @Test
    fun a_text_send_starts_a_cooldown_that_also_throttles_a_picked_file() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = slowConversation(seconds = 30))
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.onDraftChange("hello")
        h.vm.send()
        advanceUntilIdle()
        assertThat(h.vm.state.value.lastSelfSentAtMillis).isEqualTo(FIXED_NOW)

        // The cooldown a text send opened is shared by the attachment path.
        h.vm.sendFileAttachment("PDF".toByteArray(), "report.pdf", declaredMimeType = "application/pdf")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any()) }
    }

    @Test
    fun a_guest_denied_the_file_capability_cannot_send_a_picked_file() = runTest(dispatcher) {
        // defaultAnonymous grants text + images only; a PDF resolves to the file kind.
        val h = harness(
            syncedConversation(),
            currentUser = me,
            anonymousSession = anonymousGuestSession(ParticipantPermissions.defaultAnonymous),
        )
        advanceUntilIdle()

        h.vm.sendFileAttachment("PDF".toByteArray(), "report.pdf", declaredMimeType = "application/pdf")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any()) }
        assertThat(h.vm.state.value.lastSelfSentAtMillis).isNull()
    }

    @Test
    fun a_guest_who_may_send_images_can_still_send_a_picked_image() = runTest(dispatcher) {
        // Per-kind gating, not a blanket guest block: images stay open for defaultAnonymous.
        val h = harness(
            syncedConversation(),
            currentUser = me,
            anonymousSession = anonymousGuestSession(ParticipantPermissions.defaultAnonymous),
        )
        advanceUntilIdle()

        h.vm.sendFileAttachment("PNG".toByteArray(), "avatar.png", declaredMimeType = "image/png")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.mediaQueue.enqueue(any()) }
    }

    @Test
    fun a_read_only_guest_cannot_send_text() = runTest(dispatcher) {
        val muted = ParticipantPermissions(
            canSendMessages = false,
            canSendFiles = false,
            canSendImages = false,
            canSendVideos = false,
            canSendAudios = false,
            canSendLocations = false,
            canSendLinks = false,
        )
        val h = harness(
            syncedConversation(),
            currentUser = me,
            anonymousSession = anonymousGuestSession(muted),
        )
        advanceUntilIdle()

        h.vm.onDraftChange("let me in")
        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        // The refused text is kept in the draft, never silently dropped.
        assertThat(h.vm.state.value.draft).isEqualTo("let me in")
    }

    @Test
    fun send_with_an_empty_draft_and_no_clipboard_is_a_no_op() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val h = harness(flowOf(CacheResult.Empty), currentUser = user)
        advanceUntilIdle()

        h.vm.send()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.mediaQueue.enqueue(any()) }
        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    @Test
    fun send_dispatches_an_optimistic_message_and_clears_the_draft() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, workManager) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        vm.onDraftChange("hello")
        vm.send()
        advanceUntilIdle()

        assertThat(vm.state.value.draft).isEmpty()
        coVerify { repo.sendOptimistic("c1", "hello", "fr", user, null) }
        coVerify { workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun send_stamps_the_detected_language_of_the_composed_text() = runTest(dispatcher) {
        // A French user typing Spanish: the outgoing message must be stamped with
        // the DETECTED language (es), not the sender's configured systemLanguage (fr),
        // so the Prisme translates it correctly for every reader.
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        val text = "Hola, ¿cómo estás? ¿Qué tal todo por allá?"
        vm.onDraftChange(text)
        vm.send()
        advanceUntilIdle()

        coVerify { repo.sendOptimistic("c1", text, "es", user, null) }
    }

    @Test
    fun send_falls_back_to_the_resolved_user_language_for_undetectable_text() = runTest(dispatcher) {
        // A user with NO systemLanguage but a regionalLanguage: undetectable text
        // must fall back through the Prisme resolution chain (regionalLanguage = de),
        // never to the hard-coded "fr" — the pre-fix bug for regional/custom-only users.
        val user = MeeshyUser(id = "me", username = "atabeth", regionalLanguage = "de")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        coEvery { repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        vm.onDraftChange("hello")
        vm.send()
        advanceUntilIdle()

        coVerify { repo.sendOptimistic("c1", "hello", "de", user, null) }
    }

    // MARK: - Composer effects picker

    @Test
    fun toggleEffect_armsAndDisarmsAnEffectInThePendingSelection() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.EPHEMERAL)
        assertThat(vm.state.value.pendingEffects.has(MessageEffectFlags.EPHEMERAL)).isTrue()
        assertThat(vm.state.value.hasPendingEffects).isTrue()

        vm.toggleEffect(MessageEffectFlags.EPHEMERAL)
        assertThat(vm.state.value.pendingEffects.hasAnyEffect).isFalse()
        assertThat(vm.state.value.hasPendingEffects).isFalse()
    }

    @Test
    fun toggleEffect_leavesOtherArmedEffectsUntouched() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.GLOW)
        vm.toggleEffect(MessageEffectFlags.SHAKE)
        vm.toggleEffect(MessageEffectFlags.GLOW)

        assertThat(vm.state.value.pendingEffects.has(MessageEffectFlags.SHAKE)).isTrue()
        assertThat(vm.state.value.pendingEffects.has(MessageEffectFlags.GLOW)).isFalse()
    }

    @Test
    fun selectEphemeralDuration_recordsSecondsOnThePendingSelection() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.EPHEMERAL)
        vm.selectEphemeralDuration(EphemeralDuration.FIVE_MINUTES)

        assertThat(vm.state.value.pendingEffects.ephemeralDuration).isEqualTo(300)
        assertThat(vm.state.value.pendingEffects.has(MessageEffectFlags.EPHEMERAL)).isTrue()
    }

    @Test
    fun clearEffects_resetsThePendingSelection() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.EPHEMERAL)
        vm.selectEphemeralDuration(EphemeralDuration.ONE_HOUR)
        vm.clearEffects()

        assertThat(vm.state.value.pendingEffects.hasAnyEffect).isFalse()
        assertThat(vm.state.value.pendingEffects.ephemeralDuration).isNull()
    }

    @Test
    fun effectsPicker_openThenDismiss_togglesSheetButKeepsTheArmedSelection() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.RAINBOW)
        vm.openEffectsPicker()
        assertThat(vm.state.value.isEffectsPickerOpen).isTrue()

        vm.dismissEffectsPicker()
        assertThat(vm.state.value.isEffectsPickerOpen).isFalse()
        // Dismiss must not discard the selection — only a send clears it.
        assertThat(vm.state.value.pendingEffects.has(MessageEffectFlags.RAINBOW)).isTrue()
    }

    @Test
    fun send_stampsTheArmedEffectsOntoTheOutgoingMessageAndClearsThem() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        val captured = slot<MessageEffects>()
        coEvery {
            repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), capture(captured))
        } returns "cmid_1"
        advanceUntilIdle()

        vm.toggleEffect(MessageEffectFlags.EPHEMERAL)
        vm.selectEphemeralDuration(EphemeralDuration.ONE_MINUTE)
        vm.openEffectsPicker()
        vm.onDraftChange("boom")
        vm.send()
        advanceUntilIdle()

        assertThat(captured.captured.has(MessageEffectFlags.EPHEMERAL)).isTrue()
        assertThat(captured.captured.ephemeralDuration).isEqualTo(60)
        // A send disarms the composer: no effect leaks onto the next message,
        // and the picker sheet closes.
        assertThat(vm.state.value.pendingEffects.hasAnyEffect).isFalse()
        assertThat(vm.state.value.isEffectsPickerOpen).isFalse()
    }

    @Test
    fun send_withNoArmedEffects_stampsAnEmptyEffectSelection() = runTest(dispatcher) {
        val user = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")
        val (vm, repo, _) = viewModel(flowOf(CacheResult.Empty), currentUser = user)
        val captured = slot<MessageEffects>()
        coEvery {
            repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any(), capture(captured))
        } returns "cmid_1"
        advanceUntilIdle()

        vm.onDraftChange("plain")
        vm.send()
        advanceUntilIdle()

        assertThat(captured.captured.hasAnyEffect).isFalse()
    }

    @Test
    fun retryMessage_delegates_to_the_repository_and_reschedules_the_flush() = runTest(dispatcher) {
        val (vm, repo, workManager) = viewModel(flowOf(CacheResult.Empty))
        advanceUntilIdle()

        vm.retryMessage("cmid_x")
        advanceUntilIdle()

        coVerify { repo.retrySend("cmid_x") }
        coVerify { workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    private fun conversationWithRoster() = ApiConversation(
        id = "c1",
        type = "group",
        title = "Squad",
        participants = listOf(
            ApiParticipant(id = "p0", userId = "me", username = "atabeth", displayName = "Ata Beth"),
            ApiParticipant(id = "p1", userId = "u1", username = "bob", displayName = "Bob Martin", avatar = "bob.png"),
            ApiParticipant(id = "p2", userId = "u2", username = "bobby", displayName = "Bobby Tables"),
        ),
    )

    @Test
    fun roster_display_names_populate_from_the_conversation_participants() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        assertThat(h.vm.state.value.mentionDisplayNames)
            .containsExactlyEntriesIn(mapOf("bob" to "Bob Martin", "bobby" to "Bobby Tables"))
    }

    @Test
    fun a_group_conversation_exposes_its_member_count_and_group_flag_for_the_header() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        assertThat(h.vm.state.value.isGroup).isTrue()
        assertThat(h.vm.state.value.memberCount).isEqualTo(3)
    }

    @Test
    fun a_direct_conversation_is_not_flagged_as_a_group() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = directConversation())
        advanceUntilIdle()

        assertThat(h.vm.state.value.isGroup).isFalse()
        assertThat(h.vm.state.value.memberCount).isEqualTo(2)
    }

    // --- Chat header presence dot (port of iOS ConversationView.headerPresenceState) ---

    @Test
    fun headerPresence_resolves_the_other_participants_live_presence_in_a_direct_conversation() = runTest(dispatcher) {
        val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = directConversation(),
            socket = socketManager(userStatus = userStatusFlow),
        )
        advanceUntilIdle()

        userStatusFlow.emit(UserStatusEvent(userId = "u1", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(h.vm.state.value.headerPresence(nowEpochMillis = 0L)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun headerPresence_reflects_a_forced_online_event_from_a_typing_frame() = runTest(dispatcher) {
        val forcedOnlineFlow = MutableSharedFlow<UserStatusEvent>()
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = directConversation(),
            relay = typingPresenceRelay(forcedOnline = forcedOnlineFlow),
        )
        advanceUntilIdle()

        forcedOnlineFlow.emit(UserStatusEvent(userId = "u1", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(h.vm.state.value.headerPresence(nowEpochMillis = 0L)).isEqualTo(PresenceState.ONLINE)
    }

    @Test
    fun headerPresence_is_null_for_a_group_conversation_even_with_live_presence_data() = runTest(dispatcher) {
        val userStatusFlow = MutableSharedFlow<UserStatusEvent>()
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = conversationWithRoster(),
            socket = socketManager(userStatus = userStatusFlow),
        )
        advanceUntilIdle()

        userStatusFlow.emit(UserStatusEvent(userId = "u1", isOnline = true, lastActiveAt = null))
        advanceUntilIdle()

        assertThat(h.vm.state.value.headerPresence(nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun headerPresence_is_null_before_any_live_presence_data_arrives() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = directConversation())
        advanceUntilIdle()

        assertThat(h.vm.state.value.headerPresence(nowEpochMillis = 0L)).isNull()
    }

    @Test
    fun typing_an_at_query_activates_mention_suggestions_excluding_self() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        h.vm.onDraftChange("hey @bo")

        val mention = h.vm.state.value.mention
        assertThat(mention.isActive).isTrue()
        assertThat(mention.suggestions.map { it.username }).containsExactly("bob", "bobby").inOrder()
    }

    @Test
    fun clearing_the_at_query_deactivates_the_mention_panel() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()
        h.vm.onDraftChange("hey @bo")

        h.vm.onDraftChange("hey there")

        assertThat(h.vm.state.value.mention.isActive).isFalse()
    }

    @Test
    fun selecting_a_mention_rewrites_the_draft_and_dismisses_the_panel() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()
        h.vm.onDraftChange("hey @bo")
        val bob = h.vm.state.value.mention.suggestions.first { it.username == "bob" }

        h.vm.onMentionSelected(bob)

        assertThat(h.vm.state.value.draft).isEqualTo("hey @bob ")
        assertThat(h.vm.state.value.mention.isActive).isFalse()
        assertThat(h.vm.state.value.mention.draftMentions).containsKey("bob")
    }

    @Test
    fun sending_resets_the_mention_state() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()
        h.vm.onDraftChange("hey @bo")
        val bob = h.vm.state.value.mention.suggestions.first { it.username == "bob" }
        h.vm.onMentionSelected(bob)

        h.vm.send()
        advanceUntilIdle()

        assertThat(h.vm.state.value.mention).isEqualTo(MentionAutocompleteState())
    }

    @Test
    fun a_two_character_at_query_merges_directory_results_below_the_local_roster() = runTest(dispatcher) {
        val remote = FakeMentionSearch(
            default = listOf(MentionCandidate(id = "u9", username = "borys", displayName = "Borys R")),
        )
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = conversationWithRoster(),
            mentionSearch = remote,
        )
        advanceUntilIdle()

        h.vm.onDraftChange("hey @bo")
        advanceUntilIdle()

        assertThat(h.vm.state.value.mention.suggestions.map { it.username })
            .containsExactly("bob", "bobby", "borys").inOrder()
        assertThat(remote.queries).containsExactly("bo")
    }

    @Test
    fun a_single_character_at_query_stays_on_the_local_roster() = runTest(dispatcher) {
        val remote = FakeMentionSearch(
            default = listOf(MentionCandidate(id = "u9", username = "borys")),
        )
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = conversationWithRoster(),
            mentionSearch = remote,
        )
        advanceUntilIdle()

        h.vm.onDraftChange("hey @b")
        advanceUntilIdle()

        assertThat(remote.queries).isEmpty()
        assertThat(h.vm.state.value.mention.suggestions.map { it.username })
            .containsExactly("bob", "bobby").inOrder()
    }

    @Test
    fun directory_results_never_offer_the_signed_in_user() = runTest(dispatcher) {
        val remote = FakeMentionSearch(
            default = listOf(
                MentionCandidate(id = "me", username = "atabeth", displayName = "Ata Beth"),
                MentionCandidate(id = "u9", username = "carol"),
            ),
        )
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = conversationWithRoster(),
            mentionSearch = remote,
        )
        advanceUntilIdle()

        h.vm.onDraftChange("hey @at")
        advanceUntilIdle()

        assertThat(h.vm.state.value.mention.suggestions.map { it.username }).containsExactly("carol")
    }

    @Test
    fun a_new_fragment_supersedes_the_previous_directory_lookup() = runTest(dispatcher) {
        val remote = FakeMentionSearch(
            byQuery = mapOf(
                "car" to listOf(MentionCandidate(id = "u9", username = "carol")),
                "dan" to listOf(MentionCandidate(id = "u10", username = "danny")),
            ),
        )
        val h = harness(
            flowOf(CacheResult.Empty),
            currentUser = me,
            conversation = conversationWithRoster(),
            mentionSearch = remote,
        )
        advanceUntilIdle()

        h.vm.onDraftChange("hey @car")
        h.vm.onDraftChange("hey @dan")
        advanceUntilIdle()

        assertThat(h.vm.state.value.mention.suggestions.map { it.username }).containsExactly("danny")
        assertThat(remote.queries).containsExactly("dan")
    }

    private class FakeMentionSearch(
        private val byQuery: Map<String, List<MentionCandidate>> = emptyMap(),
        private val default: List<MentionCandidate> = emptyList(),
    ) : MentionSearch {
        val queries = mutableListOf<String>()

        override suspend fun search(query: String): List<MentionCandidate> {
            queries += query
            return byQuery[query] ?: default
        }
    }

    private fun directConversation() = ApiConversation(
        id = "c1",
        type = "direct",
        participants = listOf(
            ApiParticipant(id = "p0", userId = "me", username = "atabeth", displayName = "Ata Beth"),
            ApiParticipant(id = "p1", userId = "u1", username = "bob", displayName = "Bob Martin"),
        ),
    )

    private fun ownMessageReadByOnePeer() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(
                    ApiMessage(
                        id = "m1",
                        conversationId = "c1",
                        senderId = "me",
                        content = "hey",
                        deliveredCount = 1,
                        readCount = 1,
                    ),
                ),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun in_a_group_a_message_read_by_one_of_many_stays_sent() = runTest(dispatcher) {
        val h = harness(ownMessageReadByOnePeer(), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.single().deliveryStatus).isEqualTo(DeliveryStatus.Sent)
    }

    @Test
    fun in_a_direct_conversation_a_message_read_by_the_peer_shows_read() = runTest(dispatcher) {
        val h = harness(ownMessageReadByOnePeer(), currentUser = me, conversation = directConversation())
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.single().deliveryStatus).isEqualTo(DeliveryStatus.Read)
    }

    @Test
    fun hiding_my_read_receipts_degrades_a_read_message_to_delivered() = runTest(dispatcher) {
        val h = harness(
            ownMessageReadByOnePeer(),
            currentUser = me,
            conversation = directConversation(),
            showReadReceipts = false,
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.single().deliveryStatus).isEqualTo(DeliveryStatus.Delivered)
    }

    private fun pinnedStream() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(
                    ApiMessage(
                        id = "m1",
                        conversationId = "c1",
                        senderId = "other",
                        content = "first pin",
                        pinnedAt = "2026-07-08T10:00:00Z",
                    ),
                ),
                synced(
                    ApiMessage(
                        id = "m2",
                        conversationId = "c1",
                        senderId = "other",
                        content = "newest pin",
                        pinnedAt = "2026-07-08T11:00:00Z",
                    ),
                ),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun a_pinned_message_in_the_stream_surfaces_the_banner() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()

        val banner = h.vm.state.value.pinnedBanner
        assertThat(banner).isNotNull()
        assertThat(banner!!.messageId).isEqualTo("m2")
        assertThat(banner.count).isEqualTo(2)
        assertThat(banner.snippet).isEqualTo(PinnedSnippet.Text("newest pin"))
    }

    @Test
    fun no_pinned_message_leaves_the_banner_absent() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        assertThat(h.vm.state.value.pinnedBanner).isNull()
    }

    @Test
    fun tapping_the_pinned_banner_scrolls_to_the_newest_pin() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()

        h.vm.onPinnedBannerTap()

        assertThat(h.vm.state.value.scrollToMessageId).isEqualTo("m2")

        h.vm.onScrollHandled()
        assertThat(h.vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun tapping_the_banner_with_nothing_pinned_is_inert() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onPinnedBannerTap()

        assertThat(h.vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun the_pinned_sheet_lists_every_pin_newest_first() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()

        assertThat(h.vm.state.value.pinnedMessages.map { it.messageId })
            .containsExactly("m2", "m1").inOrder()
    }

    @Test
    fun opening_the_pinned_sheet_with_pins_shows_it() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()

        h.vm.openPinnedSheet()

        assertThat(h.vm.state.value.isPinnedSheetOpen).isTrue()
    }

    @Test
    fun opening_the_pinned_sheet_with_nothing_pinned_is_inert() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.openPinnedSheet()

        assertThat(h.vm.state.value.isPinnedSheetOpen).isFalse()
    }

    @Test
    fun tapping_a_pinned_row_scrolls_to_it_and_closes_the_sheet() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()
        h.vm.openPinnedSheet()

        h.vm.onPinnedMessageTap("m1")

        assertThat(h.vm.state.value.scrollToMessageId).isEqualTo("m1")
        assertThat(h.vm.state.value.isPinnedSheetOpen).isFalse()
    }

    @Test
    fun tapping_an_unknown_pinned_row_is_inert() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()
        h.vm.openPinnedSheet()

        h.vm.onPinnedMessageTap("ghost")

        assertThat(h.vm.state.value.scrollToMessageId).isNull()
        assertThat(h.vm.state.value.isPinnedSheetOpen).isTrue()
    }

    @Test
    fun closing_the_pinned_sheet_dismisses_it() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        advanceUntilIdle()
        h.vm.openPinnedSheet()

        h.vm.closePinnedSheet()

        assertThat(h.vm.state.value.isPinnedSheetOpen).isFalse()
    }

    @Test
    fun the_pinned_sheet_auto_closes_when_the_last_pin_drains_while_open() = runTest(dispatcher) {
        // Standing invariant, not just an open()-time guard: unpinning (self, a peer,
        // or a deletion) while the sheet is already showing must not leave a dead-end
        // empty sheet — and must not silently resurrect it on a later, unrelated pin.
        val stream = MutableStateFlow<CacheResult<List<LocalMessage>>>(
            CacheResult.Fresh(
                listOf(
                    synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "first pin", pinnedAt = "2026-07-08T10:00:00Z")),
                    synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "newest pin", pinnedAt = "2026-07-08T11:00:00Z")),
                ),
                ageMillis = 0,
            ),
        )
        val h = harness(stream, currentUser = me)
        advanceUntilIdle()
        h.vm.openPinnedSheet()
        assertThat(h.vm.state.value.isPinnedSheetOpen).isTrue()

        // Both pins removed — e.g. a peer unpinned m2 and this user unpinned m1.
        stream.value = CacheResult.Fresh(
            listOf(
                synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "first pin", pinnedAt = null)),
                synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "newest pin", pinnedAt = null)),
            ),
            ageMillis = 0,
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.pinnedMessages).isEmpty()
        assertThat(h.vm.state.value.isPinnedSheetOpen).isFalse()
    }

    private fun deletedStream() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(
                    ApiMessage(
                        id = "m3",
                        conversationId = "c1",
                        senderId = "me",
                        content = "",
                        deletedAt = "2026-07-08T09:00:00Z",
                    ),
                ),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun togglePin_pins_a_not_yet_pinned_message_optimistically() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.setPinnedOptimistic(any(), any()) } returns true
        advanceUntilIdle()

        h.vm.onMessageLongPress("m2")
        h.vm.togglePin("m2")
        advanceUntilIdle()

        coVerify { h.repo.setPinnedOptimistic("m2", pin = true) }
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun togglePin_unpins_an_already_pinned_message() = runTest(dispatcher) {
        val h = harness(pinnedStream(), currentUser = me)
        coEvery { h.repo.setPinnedOptimistic(any(), any()) } returns true
        advanceUntilIdle()

        h.vm.togglePin("m2")
        advanceUntilIdle()

        coVerify { h.repo.setPinnedOptimistic("m2", pin = false) }
    }

    @Test
    fun togglePin_is_inert_on_a_deleted_message() = runTest(dispatcher) {
        val h = harness(deletedStream(), currentUser = me)
        advanceUntilIdle()

        h.vm.onMessageLongPress("m3")
        h.vm.togglePin("m3")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.setPinnedOptimistic(any(), any()) }
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun togglePin_is_inert_on_an_unknown_message() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.togglePin("nope")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.setPinnedOptimistic(any(), any()) }
    }

    @Test
    fun togglePin_surfaces_a_repository_failure_as_an_error() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.setPinnedOptimistic(any(), any()) } throws RuntimeException("boom")
        advanceUntilIdle()

        h.vm.togglePin("m2")
        advanceUntilIdle()

        assertThat(h.vm.state.value.errorMessage).isEqualTo("boom")
    }

    @Test
    fun toggleStar_stars_a_message_snapshotting_its_conversation_and_closing_the_sheet() =
        runTest(dispatcher) {
            val h = harness(syncedConversation(), currentUser = me)
            advanceUntilIdle()

            h.vm.onMessageLongPress("m2")
            h.vm.toggleStar("m2")
            advanceUntilIdle()

            assertThat(h.starred.starred.value.isStarred("m2")).isTrue()
            val snap = h.starred.starred.value.items.single()
            assertThat(snap.messageId).isEqualTo("m2")
            assertThat(snap.conversationId).isEqualTo("c1")
            assertThat(snap.contentPreview).isEqualTo("yo")
            assertThat(snap.starredAtMillis).isEqualTo(FIXED_NOW)
            assertThat(h.vm.state.value.actionMessageId).isNull()
        }

    @Test
    fun toggleStar_unstars_an_already_starred_message() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.toggleStar("m2")
        advanceUntilIdle()
        h.vm.toggleStar("m2")
        advanceUntilIdle()

        assertThat(h.starred.starred.value.isStarred("m2")).isFalse()
    }

    @Test
    fun a_starred_message_is_reflected_on_its_bubble() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.toggleStar("m2")
        advanceUntilIdle()

        val bubble = h.vm.state.value.messages.first { it.messageId == "m2" }
        assertThat(bubble.isStarred).isTrue()
        assertThat(h.vm.state.value.messages.first { it.messageId == "m1" }.isStarred).isFalse()
    }

    @Test
    fun toggleStar_is_inert_on_a_deleted_message_but_still_closes_the_sheet() = runTest(dispatcher) {
        val h = harness(deletedStream(), currentUser = me)
        advanceUntilIdle()

        h.vm.onMessageLongPress("m3")
        h.vm.toggleStar("m3")
        advanceUntilIdle()

        assertThat(h.starred.starred.value.items).isEmpty()
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun toggleStar_is_inert_on_an_unknown_message() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.toggleStar("nope")
        advanceUntilIdle()

        assertThat(h.starred.starred.value.items).isEmpty()
    }

    @Test
    fun a_pinned_socket_event_refreshes_the_open_conversation() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        messagePinned.emit(MessagePinnedEvent(messageId = "m2", conversationId = "c1"))
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.refresh("c1") }
    }

    @Test
    fun a_pinned_socket_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        messagePinned.emit(MessagePinnedEvent(messageId = "m2", conversationId = "other"))
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.refresh("c1") }
    }

    @Test
    fun a_translation_event_applies_the_translation_to_the_open_conversation() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        translationReceived.emit(
            TranslationEvent(
                messageId = "m2",
                conversationId = "c1",
                targetLanguage = "fr",
                translatedContent = "Bonjour",
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.applyTranslation("m2", "fr", "Bonjour") }
    }

    @Test
    fun a_translation_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        translationReceived.emit(
            TranslationEvent(
                messageId = "m2",
                conversationId = "other",
                targetLanguage = "fr",
                translatedContent = "Bonjour",
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.applyTranslation(any(), any(), any()) }
    }

    @Test
    fun a_transcription_ready_event_applies_the_transcription_to_the_open_conversation() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        transcriptionReady.emit(
            TranscriptionReadyEvent(
                messageId = "m2",
                conversationId = "c1",
                attachmentId = "a1",
                transcription = TranscriptionPayload(
                    text = "Hello there",
                    language = "en",
                    confidence = 0.9,
                    durationMs = 4200L,
                ),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.applyTranscription("m2", "a1", "Hello there", "en", 0.9, 4200L) }
    }

    @Test
    fun a_transcription_ready_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        transcriptionReady.emit(
            TranscriptionReadyEvent(
                messageId = "m2",
                conversationId = "other",
                attachmentId = "a1",
                transcription = TranscriptionPayload(text = "Hello there"),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.applyTranscription(any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun an_audio_translation_ready_event_applies_the_cloned_voice_to_the_open_conversation() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        audioTranslationReady.emit(
            AudioTranslationEvent(
                messageId = "m2",
                conversationId = "c1",
                attachmentId = "a1",
                language = "es",
                translatedAudio = TranslatedAudioPayload(
                    url = "https://cdn/es.mp3",
                    transcription = "hola",
                    durationMs = 5200L,
                    format = "mp3",
                    cloned = true,
                    quality = 0.9,
                    voiceModelId = "vm-1",
                    ttsModel = "xtts",
                ),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 1) {
            h.repo.applyAudioTranslation(
                "m2", "a1", "es", "https://cdn/es.mp3", "hola", 5200L, "mp3", true, 0.9, "vm-1", "xtts",
            )
        }
    }

    @Test
    fun an_audio_translation_ready_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        audioTranslationReady.emit(
            AudioTranslationEvent(
                messageId = "m2",
                conversationId = "other",
                attachmentId = "a1",
                language = "es",
                translatedAudio = TranslatedAudioPayload(url = "https://cdn/es.mp3"),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) {
            h.repo.applyAudioTranslation(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), any())
        }
    }

    @Test
    fun tapping_a_language_flag_switches_the_bubble_to_that_translation() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()
        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")

        h.vm.onFlagTap("m1", "es")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Hola")
        assertThat(activeStripCode(h, "m1")).isEqualTo("es")
    }

    @Test
    fun tapping_the_active_language_flag_reverts_to_the_preferred_translation() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()
        h.vm.onFlagTap("m1", "es")
        advanceUntilIdle()
        assertThat(bubbleText(h, "m1")).isEqualTo("Hola")

        h.vm.onFlagTap("m1", "es")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
        assertThat(activeStripCode(h, "m1")).isEqualTo("fr")
    }

    @Test
    fun tapping_the_original_language_flag_shows_the_original_text() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onFlagTap("m1", "en")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Hello")
        assertThat(h.vm.state.value.messages.single { it.messageId == "m1" }.isShowingOriginal).isTrue()
        assertThat(activeStripCode(h, "m1")).isEqualTo("en")
    }

    @Test
    fun tapping_the_preferred_flag_while_it_is_active_is_inert() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onFlagTap("m1", "fr")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
        assertThat(activeStripCode(h, "m1")).isEqualTo("fr")
    }

    @Test
    fun tapping_a_language_without_content_leaves_the_bubble_unchanged() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onFlagTap("m1", "de")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
        assertThat(activeStripCode(h, "m1")).isEqualTo("fr")
    }

    @Test
    fun tapping_a_flag_on_an_unknown_message_is_inert() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onFlagTap("does-not-exist", "es")
        advanceUntilIdle()

        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
    }

    @Test
    fun the_strip_offers_a_translatable_chip_for_a_configured_language_without_content() =
        runTest(dispatcher) {
            val h = harness(onDemandStream(), currentUser = frEsDe)
            advanceUntilIdle()

            val de = h.vm.state.value.messages.single { it.messageId == "m1" }
                .languageStrip.single { it.code == "de" }
            assertThat(de.isTranslatable).isTrue()
            assertThat(de.isActive).isFalse()
        }

    @Test
    fun tapping_a_translatable_flag_requests_a_translation_and_switches_to_it() = runTest(dispatcher) {
        val stream = onDemandStream()
        val h = harness(stream, currentUser = frEsDe)
        advanceUntilIdle()
        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
        coEvery { h.repo.requestTranslation("m1", "de") } coAnswers {
            stream.value = CacheResult.Fresh(listOf(onDemandMessage(withDe = true)), ageMillis = 0)
            true
        }

        h.vm.onFlagTap("m1", "de")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.requestTranslation("m1", "de") }
        assertThat(bubbleText(h, "m1")).isEqualTo("Guten Tag")
        assertThat(activeStripCode(h, "m1")).isEqualTo("de")
    }

    @Test
    fun a_failed_on_demand_translation_leaves_the_active_language_unchanged() = runTest(dispatcher) {
        val h = harness(onDemandStream(), currentUser = frEsDe)
        advanceUntilIdle()
        coEvery { h.repo.requestTranslation("m1", "de") } returns false

        h.vm.onFlagTap("m1", "de")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.requestTranslation("m1", "de") }
        assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
        assertThat(activeStripCode(h, "m1")).isEqualTo("fr")
    }

    @Test
    fun a_second_tap_while_a_translation_is_in_flight_does_not_fire_a_duplicate_request() =
        runTest(dispatcher) {
            val h = harness(onDemandStream(), currentUser = frEsDe)
            advanceUntilIdle()
            val gate = CompletableDeferred<Boolean>()
            coEvery { h.repo.requestTranslation("m1", "de") } coAnswers { gate.await() }

            h.vm.onFlagTap("m1", "de")
            h.vm.onFlagTap("m1", "de")
            runCurrent()
            gate.complete(false)
            advanceUntilIdle()

            coVerify(exactly = 1) { h.repo.requestTranslation("m1", "de") }
        }

    @Test
    fun opening_the_language_explorer_targets_the_message_and_closes_the_action_sheet() =
        runTest(dispatcher) {
            val h = harness(flagStripStream(), currentUser = frEs)
            advanceUntilIdle()
            h.vm.onMessageLongPress("m1")

            h.vm.openLanguageExplorer("m1")
            advanceUntilIdle()

            assertThat(h.vm.state.value.explorerMessageId).isEqualTo("m1")
            assertThat(h.vm.state.value.actionMessageId).isNull()
        }

    @Test
    fun dismissing_the_language_explorer_clears_the_target() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()
        h.vm.openLanguageExplorer("m1")
        advanceUntilIdle()

        h.vm.dismissLanguageExplorer()
        advanceUntilIdle()

        assertThat(h.vm.state.value.explorerMessageId).isNull()
    }

    @Test
    fun retranslating_from_the_explorer_refetches_even_when_the_language_has_content() =
        runTest(dispatcher) {
            val stream = MutableStateFlow(CacheResult.Fresh(listOf(flagStripMessage()), ageMillis = 0))
            val h = harness(stream, currentUser = frEs)
            advanceUntilIdle()
            assertThat(bubbleText(h, "m1")).isEqualTo("Bonjour")
            coEvery { h.repo.requestTranslation("m1", "fr") } coAnswers {
                stream.value = CacheResult.Fresh(listOf(flagStripMessage(frText = "Salut")), ageMillis = 0)
                true
            }

            h.vm.onExplorerRetranslate("m1", "fr")
            advanceUntilIdle()

            // onFlagTap would NOT hit the network for an already-translated language —
            // retranslate must force the refetch.
            coVerify(exactly = 1) { h.repo.requestTranslation("m1", "fr") }
            assertThat(bubbleText(h, "m1")).isEqualTo("Salut")
            assertThat(activeStripCode(h, "m1")).isEqualTo("fr")
        }

    @Test
    fun retranslating_an_unknown_message_makes_no_request() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onExplorerRetranslate("does-not-exist", "fr")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.requestTranslation(any(), any()) }
    }

    @Test
    fun retranslating_with_a_blank_code_makes_no_request() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()

        h.vm.onExplorerRetranslate("m1", "   ")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.requestTranslation(any(), any()) }
    }

    @Test
    fun a_second_retranslate_while_one_is_in_flight_does_not_duplicate_the_request() =
        runTest(dispatcher) {
            val h = harness(flagStripStream(), currentUser = frEs)
            advanceUntilIdle()
            val gate = CompletableDeferred<Boolean>()
            coEvery { h.repo.requestTranslation("m1", "fr") } coAnswers { gate.await() }

            h.vm.onExplorerRetranslate("m1", "fr")
            h.vm.onExplorerRetranslate("m1", "fr")
            runCurrent()
            assertThat(h.vm.state.value.translatingLanguages).contains("m1|fr")
            gate.complete(false)
            advanceUntilIdle()

            coVerify(exactly = 1) { h.repo.requestTranslation("m1", "fr") }
            assertThat(h.vm.state.value.translatingLanguages).doesNotContain("m1|fr")
        }

    @Test
    fun a_failed_retranslation_surfaces_the_error_and_clears_the_in_flight_marker() =
        runTest(dispatcher) {
            val h = harness(flagStripStream(), currentUser = frEs)
            advanceUntilIdle()
            coEvery { h.repo.requestTranslation("m1", "fr") } throws RuntimeException("boom")

            h.vm.onExplorerRetranslate("m1", "fr")
            advanceUntilIdle()

            assertThat(h.vm.state.value.errorMessage).isEqualTo("boom")
            assertThat(h.vm.state.value.translatingLanguages).doesNotContain("m1|fr")
        }

    @Test
    fun opening_the_explorer_projects_the_message_language_model() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()
        assertThat(h.vm.state.value.languageExplorer).isNull()

        h.vm.openLanguageExplorer("m1")
        advanceUntilIdle()

        val explorer = h.vm.state.value.languageExplorer!!
        assertThat(explorer.originalCode).isEqualTo("en")
        assertThat(explorer.rows.single { it.code == "fr" }.hasContent).isTrue()
        assertThat(explorer.rows.single { it.code == "es" }.hasContent).isTrue()
        assertThat(explorer.rows.none { it.code == "en" }).isTrue()
    }

    @Test
    fun the_explorer_clears_its_model_when_dismissed() = runTest(dispatcher) {
        val h = harness(flagStripStream(), currentUser = frEs)
        advanceUntilIdle()
        h.vm.openLanguageExplorer("m1")
        advanceUntilIdle()
        assertThat(h.vm.state.value.languageExplorer).isNotNull()

        h.vm.dismissLanguageExplorer()
        advanceUntilIdle()

        assertThat(h.vm.state.value.languageExplorer).isNull()
    }

    @Test
    fun the_explorer_marks_an_in_flight_language_as_translating() = runTest(dispatcher) {
        val h = harness(onDemandStream(), currentUser = frEsDe)
        advanceUntilIdle()
        h.vm.openLanguageExplorer("m1")
        advanceUntilIdle()
        assertThat(h.vm.state.value.languageExplorer!!.rows.single { it.code == "de" }.hasContent)
            .isFalse()
        val gate = CompletableDeferred<Boolean>()
        coEvery { h.repo.requestTranslation("m1", "de") } coAnswers { gate.await() }

        h.vm.onExplorerRetranslate("m1", "de")
        runCurrent()

        assertThat(h.vm.state.value.languageExplorer!!.rows.single { it.code == "de" }.isTranslating)
            .isTrue()
        gate.complete(false)
        advanceUntilIdle()
        assertThat(h.vm.state.value.languageExplorer!!.rows.single { it.code == "de" }.isTranslating)
            .isFalse()
    }

    @Test
    fun an_unpinned_socket_event_refreshes_the_open_conversation() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        messageUnpinned.emit(MessageUnpinnedEvent(messageId = "m2", conversationId = "c1"))
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.refresh("c1") }
    }

    @Test
    fun an_unpinned_socket_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        messageUnpinned.emit(MessageUnpinnedEvent(messageId = "m2", conversationId = "other"))
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.refresh("c1") }
    }

    private fun forwardCandidates() = listOf(
        ApiConversation(id = "c1", title = "Source", type = "group"),
        ApiConversation(id = "c2", title = "Alpha", type = "group"),
        ApiConversation(id = "c3", title = "Beta", type = "group"),
    )

    @Test
    fun openForward_lists_every_conversation_except_the_source() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()

        h.vm.openForward("m1")
        advanceUntilIdle()

        val forward = h.vm.state.value.forward
        assertThat(forward).isNotNull()
        assertThat(forward!!.sourceMessageId).isEqualTo("m1")
        assertThat(forward.targets.map { it.conversationId }).containsExactly("c2", "c3").inOrder()
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun onForwardQueryChange_filters_the_targets() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.onForwardQueryChange("beta")
        advanceUntilIdle()

        assertThat(h.vm.state.value.forward!!.targets.map { it.conversationId }).containsExactly("c3")
    }

    @Test
    fun forwardTo_optimistically_sends_the_source_message_into_the_target_and_marks_it_sent() =
        runTest(dispatcher) {
            val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
            advanceUntilIdle()
            h.vm.openForward("m1")
            advanceUntilIdle()

            h.vm.forwardTo("c2")
            advanceUntilIdle()

            coVerify(exactly = 1) {
                h.repo.sendOptimistic(
                    conversationId = "c2",
                    content = "salut",
                    originalLanguage = "fr",
                    sender = me,
                    forwardedFromId = "m1",
                    forwardedFromConversationId = "c1",
                )
            }
            verify(atLeast = 1) { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
            val forward = h.vm.state.value.forward!!
            assertThat(forward.sentConversationIds).containsExactly("c2")
            assertThat(forward.sendingConversationId).isNull()
        }

    @Test
    fun forwardTo_is_inert_when_the_target_was_already_forwarded_to() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.forwardTo("c2")
        advanceUntilIdle()
        h.vm.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun forwardTo_is_inert_when_the_source_message_is_unknown() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()
        h.vm.openForward("ghost")
        advanceUntilIdle()

        h.vm.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun forwardTo_refuses_to_forward_an_unsent_bubble() = runTest(dispatcher) {
        val unsent = flowOf(
            CacheResult.Fresh(
                listOf(
                    LocalMessage(
                        ApiMessage(id = "m1", conversationId = "c1", senderId = "me", content = "salut"),
                        LocalSendState.SENDING,
                    ),
                ),
                ageMillis = 0,
            ),
        )
        val h = harness(unsent, currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.forwardTo("c2")
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any()) }
    }

    @Test
    fun forwardTo_surfaces_an_error_and_clears_the_sending_flag_on_failure() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        coEvery {
            h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any())
        } throws RuntimeException("boom")
        advanceUntilIdle()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.forwardTo("c2")
        advanceUntilIdle()

        assertThat(h.vm.state.value.errorMessage).isEqualTo("boom")
        assertThat(h.vm.state.value.forward!!.sendingConversationId).isNull()
        assertThat(h.vm.state.value.forward!!.sentConversationIds).isEmpty()
    }

    @Test
    fun closeForward_dismisses_the_picker() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        advanceUntilIdle()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.closeForward()

        assertThat(h.vm.state.value.forward).isNull()
    }

    @Test
    fun forwardTo_completing_after_the_sheet_reopened_on_another_message_does_not_corrupt_that_session() =
        runTest(dispatcher) {
            val gate = CompletableDeferred<Unit>()
            val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
            coEvery {
                h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any())
            } coAnswers { gate.await(); "cmid_1" }
            advanceUntilIdle()

            h.vm.openForward("m1")
            advanceUntilIdle()
            h.vm.forwardTo("c2")
            advanceUntilIdle()

            // Sheet dismissed and reopened on a DIFFERENT message before the send resolves.
            h.vm.closeForward()
            h.vm.openForward("m2")
            advanceUntilIdle()

            gate.complete(Unit)
            advanceUntilIdle()

            val forward = h.vm.state.value.forward!!
            assertThat(forward.sourceMessageId).isEqualTo("m2")
            assertThat(forward.sentConversationIds).isEmpty()
            assertThat(forward.sendingConversationId).isNull()
        }

    @Test
    fun forwardTo_reopening_the_same_message_mid_send_does_not_allow_a_duplicate_send() = runTest(dispatcher) {
        val gate = CompletableDeferred<Unit>()
        val h = harness(syncedConversation(), currentUser = me, targetConversations = forwardCandidates())
        coEvery {
            h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any())
        } coAnswers { gate.await(); "cmid_1" }
        advanceUntilIdle()

        h.vm.openForward("m1")
        advanceUntilIdle()
        h.vm.forwardTo("c2")
        advanceUntilIdle()

        // Sheet dismissed and reopened on the SAME message while the send is still in flight.
        h.vm.closeForward()
        h.vm.openForward("m1")
        advanceUntilIdle()

        h.vm.forwardTo("c2")
        advanceUntilIdle()

        gate.complete(Unit)
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.sendOptimistic(any(), any(), any(), any(), any(), any(), any()) }
    }

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

    private val FIXED_NOW = java.time.Instant.parse("2026-07-07T12:00:00Z").toEpochMilli()

    private fun messageCreatedAt(senderId: String, createdAt: String?) = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(
                    ApiMessage(
                        id = "m1",
                        conversationId = "c1",
                        senderId = senderId,
                        content = "salut",
                        createdAt = createdAt,
                    ),
                ),
            ),
            ageMillis = 0,
        ),
    )

    private fun syncedConversation() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(
                    ApiMessage(
                        id = "m1",
                        conversationId = "c1",
                        senderId = "me",
                        content = "salut",
                        translations = listOf(
                            ApiTextTranslation(targetLanguage = "fr", translatedContent = "salut fr"),
                        ),
                    ),
                ),
                synced(ApiMessage(id = "m2", conversationId = "c1", senderId = "other", content = "yo")),
            ),
            ageMillis = 0,
        ),
    )

    private val frEs = MeeshyUser(
        id = "me",
        username = "atabeth",
        systemLanguage = "fr",
        regionalLanguage = "es",
    )

    /** m1 (original en) translated to fr+es; the fr text is parameterisable for retranslate tests. */
    private fun flagStripMessage(frText: String = "Bonjour") = synced(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "Hello",
            originalLanguage = "en",
            translations = listOf(
                ApiTextTranslation(targetLanguage = "fr", translatedContent = frText),
                ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
            ),
        ),
    )

    private fun flagStripStream() = flowOf(
        CacheResult.Fresh(listOf(flagStripMessage()), ageMillis = 0),
    )

    private val frEsDe = MeeshyUser(
        id = "me",
        username = "atabeth",
        systemLanguage = "fr",
        regionalLanguage = "es",
        customDestinationLanguage = "de",
    )

    /** m1 translated to fr+es (viewer configures fr/es/de), optionally with de content merged in. */
    private fun onDemandMessage(withDe: Boolean) = synced(
        ApiMessage(
            id = "m1",
            conversationId = "c1",
            senderId = "other",
            content = "Hello",
            originalLanguage = "en",
            translations = buildList {
                add(ApiTextTranslation(targetLanguage = "fr", translatedContent = "Bonjour"))
                add(ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"))
                if (withDe) add(ApiTextTranslation(targetLanguage = "de", translatedContent = "Guten Tag"))
            },
        ),
    )

    private fun onDemandStream(withDe: Boolean = false): MutableStateFlow<CacheResult<List<LocalMessage>>> =
        MutableStateFlow(CacheResult.Fresh(listOf(onDemandMessage(withDe)), ageMillis = 0))

    private fun bubbleText(h: Harness, messageId: String): String =
        h.vm.state.value.messages.single { it.messageId == messageId }.text

    private fun activeStripCode(h: Harness, messageId: String): String? =
        h.vm.state.value.messages.single { it.messageId == messageId }
            .languageStrip.singleOrNull { it.isActive }?.code

    @Test
    fun long_press_opens_the_action_sheet_and_hydrates_own_reactions() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.reactions.fetchDetails("m2") } returns NetworkResult.Success(
            ReactionSyncResponse(messageId = "m2", userReactions = listOf("❤️")),
        )
        advanceUntilIdle()

        h.vm.onMessageLongPress("m2")
        advanceUntilIdle()

        assertThat(h.vm.state.value.actionMessageId).isEqualTo("m2")
        assertThat(h.vm.state.value.ownReactions["m2"]).containsExactly("❤️")
    }

    @Test
    fun dismissing_the_action_sheet_clears_the_target() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onMessageLongPress("m2")
        h.vm.dismissMessageActions()

        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    private fun imageMessage(id: String, vararg urls: String) = synced(
        ApiMessage(
            id = id,
            conversationId = "c1",
            senderId = "other",
            content = "",
            attachments = urls.mapIndexed { index, url ->
                ApiMessageAttachment(
                    id = "$id-a$index",
                    mimeType = "image/jpeg",
                    fileUrl = url,
                )
            },
        ),
    )

    private fun imageConversation() = flowOf(
        CacheResult.Fresh(
            listOf(
                imageMessage("m1", "https://cdn/1.jpg", "https://cdn/2.jpg"),
                imageMessage("m2", "https://cdn/3.jpg"),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun tapping_an_image_opens_a_conversation_wide_gallery_and_dismissing_clears_it() = runTest(dispatcher) {
        val h = harness(imageConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.openImageViewer("m2", 0)

        // The gallery spans every image in the conversation (not just m2's), and
        // starts on the tapped one (m1 contributes 2 images, so m2's first is #2).
        assertThat(h.vm.state.value.imageViewer).isEqualTo(
            ConversationGallery(
                pages = listOf(
                    GalleryPage("https://cdn/1.jpg"),
                    GalleryPage("https://cdn/2.jpg"),
                    GalleryPage("https://cdn/3.jpg"),
                ),
                startIndex = 2,
            ),
        )

        h.vm.dismissImageViewer()
        assertThat(h.vm.state.value.imageViewer).isNull()
    }

    @Test
    fun tapping_a_message_with_no_images_opens_no_gallery() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.openImageViewer("m2", 1)

        assertThat(h.vm.state.value.imageViewer).isNull()
    }

    private fun fileMessage(id: String, fileUrl: String? = "docs/report.pdf") = synced(
        ApiMessage(
            id = id,
            conversationId = "c1",
            senderId = "other",
            content = "",
            attachments = listOf(
                ApiMessageAttachment(
                    id = "$id-file",
                    mimeType = "application/pdf",
                    originalName = "report.pdf",
                    fileUrl = fileUrl,
                ),
            ),
        ),
    )

    private fun fileConversation(fileUrl: String? = "docs/report.pdf") = flowOf(
        CacheResult.Fresh(listOf(fileMessage("m1", fileUrl)), ageMillis = 0),
    )

    @Test
    fun opening_a_file_attachment_downloads_it_then_the_state_surfaces_progress() = runTest(dispatcher) {
        val h = harness(fileConversation(), currentUser = me)
        every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.InProgress(progressPercent = 40),
        )
        advanceUntilIdle()

        h.vm.onFileAttachmentOpen("m1")
        advanceUntilIdle()

        assertThat(h.vm.state.value.fileDownload).isEqualTo(
            FileAttachmentDownloadUiState(
                messageId = "m1",
                attachmentId = "m1-file",
                fileName = "report.pdf",
                state = FileAttachmentDownloadState.InProgress(progressPercent = 40),
                openWhenDone = true,
            ),
        )
    }

    @Test
    fun sharing_a_file_attachment_sets_openWhenDone_to_false() = runTest(dispatcher) {
        val h = harness(fileConversation(), currentUser = me)
        every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.InProgress(progressPercent = null),
        )
        advanceUntilIdle()

        h.vm.onFileAttachmentShare("m1")
        advanceUntilIdle()

        assertThat(h.vm.state.value.fileDownload?.openWhenDone).isFalse()
    }

    @Test
    fun opening_a_file_attachment_with_no_url_yet_surfaces_not_available_without_calling_the_downloader() =
        runTest(dispatcher) {
            val h = harness(fileConversation(fileUrl = null), currentUser = me)
            advanceUntilIdle()

            h.vm.onFileAttachmentOpen("m1")
            advanceUntilIdle()

            assertThat(h.vm.state.value.fileDownload?.state).isEqualTo(
                FileAttachmentDownloadState.Failed(FileAttachmentDownloadFailure.NotAvailable),
            )
            verify(exactly = 0) { h.fileDownloader.download(any(), any(), any()) }
        }

    private fun twoFileMessage(id: String) = synced(
        ApiMessage(
            id = id,
            conversationId = "c1",
            senderId = "other",
            content = "",
            attachments = listOf(
                ApiMessageAttachment(
                    id = "$id-contrat",
                    mimeType = "application/pdf",
                    originalName = "contrat.pdf",
                    fileUrl = "docs/contrat.pdf",
                ),
                ApiMessageAttachment(
                    id = "$id-annexe",
                    mimeType = "application/pdf",
                    originalName = "annexe.pdf",
                    fileUrl = "docs/annexe.pdf",
                ),
            ),
        ),
    )

    private fun twoFileConversation() = flowOf(
        CacheResult.Fresh(listOf(twoFileMessage("m1")), ageMillis = 0),
    )

    @Test
    fun tapping_the_second_file_row_of_a_multi_file_message_downloads_that_file_not_the_first() =
        runTest(dispatcher) {
            val h = harness(twoFileConversation(), currentUser = me)
            every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
                FileAttachmentDownloadState.InProgress(progressPercent = null),
            )
            advanceUntilIdle()

            h.vm.onFileAttachmentOpen("m1", attachmentId = "m1-annexe")
            advanceUntilIdle()

            assertThat(h.vm.state.value.fileDownload?.attachmentId).isEqualTo("m1-annexe")
            assertThat(h.vm.state.value.fileDownload?.fileName).isEqualTo("annexe.pdf")
        }

    @Test
    fun sharing_the_second_file_row_of_a_multi_file_message_shares_that_file_not_the_first() =
        runTest(dispatcher) {
            val h = harness(twoFileConversation(), currentUser = me)
            every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
                FileAttachmentDownloadState.InProgress(progressPercent = null),
            )
            advanceUntilIdle()

            h.vm.onFileAttachmentShare("m1", attachmentId = "m1-annexe")
            advanceUntilIdle()

            assertThat(h.vm.state.value.fileDownload?.attachmentId).isEqualTo("m1-annexe")
            assertThat(h.vm.state.value.fileDownload?.openWhenDone).isFalse()
        }

    @Test
    fun no_attachmentId_falls_back_to_the_first_file_row_for_the_message_actions_sheet() =
        runTest(dispatcher) {
            val h = harness(twoFileConversation(), currentUser = me)
            every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
                FileAttachmentDownloadState.InProgress(progressPercent = null),
            )
            advanceUntilIdle()

            h.vm.onFileAttachmentOpen("m1")
            advanceUntilIdle()

            assertThat(h.vm.state.value.fileDownload?.attachmentId).isEqualTo("m1-contrat")
        }

    @Test
    fun reopening_an_already_downloaded_file_attachment_reuses_it_instead_of_downloading_again() =
        runTest(dispatcher) {
            val h = harness(fileConversation(), currentUser = me)
            every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
                FileAttachmentDownloadState.Completed(localUri = "content://downloads/1", mimeType = "application/pdf"),
            )
            advanceUntilIdle()

            h.vm.onFileAttachmentOpen("m1")
            advanceUntilIdle()
            h.vm.onFileAttachmentOpen("m1")
            advanceUntilIdle()

            verify(exactly = 1) { h.fileDownloader.download(any(), any(), any()) }
            assertThat(h.vm.state.value.fileDownload?.state).isEqualTo(
                FileAttachmentDownloadState.Completed(localUri = "content://downloads/1", mimeType = "application/pdf"),
            )
        }

    @Test
    fun dismissing_the_file_download_clears_it() = runTest(dispatcher) {
        val h = harness(fileConversation(), currentUser = me)
        every { h.fileDownloader.download(any(), any(), any()) } returns flowOf(
            FileAttachmentDownloadState.InProgress(progressPercent = null),
        )
        advanceUntilIdle()
        h.vm.onFileAttachmentOpen("m1")
        advanceUntilIdle()

        h.vm.dismissFileDownload()

        assertThat(h.vm.state.value.fileDownload).isNull()
    }

    @Test
    fun toggleReaction_adds_when_the_emoji_is_not_mine_yet() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "🔥")
        advanceUntilIdle()

        coVerify { h.repo.toggleReactionOptimistic("m2", "🔥", isAdding = true) }
        assertThat(h.vm.state.value.ownReactions["m2"]).containsExactly("🔥")
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun quick_reactions_start_as_the_default_strip() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        assertThat(h.vm.state.value.quickReactions)
            .containsExactly("❤️", "😂", "🔥", "👏", "😮", "😢", "🥰", "👍").inOrder()
    }

    @Test
    fun adding_a_reaction_records_usage_and_floats_it_to_the_strip_front() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "😢")
        advanceUntilIdle()

        assertThat(h.emojiUsage.usage.value["😢"]).isEqualTo(1)
        assertThat(h.vm.state.value.quickReactions.first()).isEqualTo("😢")
    }

    @Test
    fun removing_a_reaction_does_not_record_usage() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "🔥") // add → records once
        advanceUntilIdle()
        h.vm.toggleReaction("m2", "🔥") // remove → no record
        advanceUntilIdle()

        assertThat(h.emojiUsage.usage.value["🔥"]).isEqualTo(1)
    }

    @Test
    fun opening_the_emoji_picker_targets_the_message_and_closes_the_action_sheet() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onMessageLongPress("m2")
        h.vm.openEmojiPicker("m2")

        assertThat(h.vm.state.value.emojiPickerMessageId).isEqualTo("m2")
        assertThat(h.vm.state.value.actionMessageId).isNull()

        h.vm.dismissEmojiPicker()
        assertThat(h.vm.state.value.emojiPickerMessageId).isNull()
    }

    @Test
    fun toggleReaction_removes_when_the_emoji_is_already_mine() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "🔥")
        advanceUntilIdle()
        h.vm.toggleReaction("m2", "🔥")
        advanceUntilIdle()

        coVerify { h.repo.toggleReactionOptimistic("m2", "🔥", isAdding = false) }
        assertThat(h.vm.state.value.ownReactions["m2"] ?: emptySet<String>()).isEmpty()
    }

    @Test
    fun own_reactions_flow_into_the_bubbles() = runTest(dispatcher) {
        val stream = flowOf(
            CacheResult.Fresh(
                listOf(
                    synced(
                        ApiMessage(
                            id = "m2",
                            conversationId = "c1",
                            senderId = "other",
                            content = "yo",
                            reactionSummary = mapOf("🔥" to 1),
                        ),
                    ),
                ),
                ageMillis = 0,
            ),
        )
        val h = harness(stream, currentUser = me)
        coEvery { h.repo.toggleReactionOptimistic(any(), any(), any()) } returns true
        advanceUntilIdle()

        h.vm.toggleReaction("m2", "🔥")
        advanceUntilIdle()

        val bubble = h.vm.state.value.messages.single { it.messageId == "m2" }
        assertThat(bubble.reactions.single { it.emoji == "🔥" }.includesMe).isTrue()
    }

    @Test
    fun a_reaction_event_from_someone_else_applies_a_cache_delta() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        reactionAdded.emit(
            ReactionUpdateEvent(messageId = "m2", conversationId = "c1", userId = "other", emoji = "❤️"),
        )
        advanceUntilIdle()

        coVerify { h.repo.applyReactionDelta("m2", "❤️", 1) }
    }

    @Test
    fun my_own_echoed_reaction_event_is_not_double_counted() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        reactionAdded.emit(
            ReactionUpdateEvent(messageId = "m2", conversationId = "c1", userId = "me", emoji = "❤️"),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.applyReactionDelta(any(), any(), any()) }
    }

    @Test
    fun startEdit_fills_the_draft_with_the_original_content() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startEdit("m1")

        assertThat(h.vm.state.value.editingMessageId).isEqualTo("m1")
        assertThat(h.vm.state.value.draft).isEqualTo("salut")
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun send_in_edit_mode_applies_the_edit_and_leaves_edit_mode() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.editOptimistic(any(), any()) } returns true
        advanceUntilIdle()

        h.vm.startEdit("m1")
        h.vm.onDraftChange("salut tout le monde")
        h.vm.send()
        advanceUntilIdle()

        coVerify { h.repo.editOptimistic("m1", "salut tout le monde") }
        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
        assertThat(h.vm.state.value.editingMessageId).isNull()
        assertThat(h.vm.state.value.draft).isEmpty()
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun cancelEdit_restores_a_clean_composer() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startEdit("m1")
        h.vm.cancelEdit()

        assertThat(h.vm.state.value.editingMessageId).isNull()
        assertThat(h.vm.state.value.draft).isEmpty()
    }

    @Test
    fun a_stored_draft_is_restored_into_the_composer_when_the_conversation_opens() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent thought")),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("unsent thought")
    }

    @Test
    fun opening_a_conversation_with_no_stored_draft_leaves_the_composer_empty() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEmpty()
    }

    @Test
    fun typing_auto_saves_the_draft_to_the_durable_store() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("half a sentence")
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")?.text).isEqualTo("half a sentence")
    }

    @Test
    fun clearing_the_composer_purges_the_stored_draft() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent")),
        )
        advanceUntilIdle()

        h.vm.onDraftChange("")
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun sending_a_message_purges_the_stored_draft() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.onDraftChange("hello")
        advanceUntilIdle()
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun arming_an_effect_on_an_empty_composer_persists_it_to_the_durable_store() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.toggleEffect(MessageEffectFlags.CONFETTI)
        advanceUntilIdle()

        val stored = h.draftStore.load("c1")
        assertThat(stored?.effects?.has(MessageEffectFlags.CONFETTI)).isTrue()
        assertThat(stored?.text).isEqualTo("")
    }

    @Test
    fun clearing_the_last_armed_effect_on_an_empty_composer_purges_the_stored_draft() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf(
                "c1" to ConversationDraft(
                    conversationId = "c1",
                    text = "",
                    effects = MessageEffects(flags = MessageEffectFlags.GLOW),
                ),
            ),
        )
        advanceUntilIdle()

        h.vm.clearEffects()
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun an_effects_only_stored_draft_re_arms_the_composer_effects_on_open() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf(
                "c1" to ConversationDraft(
                    conversationId = "c1",
                    text = "",
                    effects = MessageEffects(flags = MessageEffectFlags.EPHEMERAL, ephemeralDuration = 300),
                ),
            ),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.pendingEffects.has(MessageEffectFlags.EPHEMERAL)).isTrue()
        assertThat(h.vm.state.value.pendingEffects.ephemeralDuration).isEqualTo(300)
        assertThat(h.vm.state.value.draft).isEqualTo("")
    }

    @Test
    fun picking_a_composer_language_persists_it_alongside_the_typed_draft() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("hola")
        h.vm.onComposerLanguagePicked("de")
        advanceUntilIdle()

        val stored = h.draftStore.load("c1")
        assertThat(stored?.text).isEqualTo("hola")
        assertThat(stored?.selectedLanguage).isEqualTo("de")
    }

    @Test
    fun picking_a_language_on_an_empty_composer_persists_nothing() = runTest(dispatcher) {
        // Parity with iOS: a language pick is not content, so it never creates a draft on its own.
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onComposerLanguagePicked("de")
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun a_stored_draft_re_applies_its_manual_language_on_open() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf(
                "c1" to ConversationDraft(conversationId = "c1", text = "hola", selectedLanguage = "de"),
            ),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("hola")
        // The restored manual pick wins over live detection of the restored Spanish text.
        assertThat(h.vm.state.value.composerLanguageCode).isEqualTo("de")
    }

    @Test
    fun editing_a_message_never_overwrites_the_stored_new_message_draft() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "keep me")),
        )
        advanceUntilIdle()

        h.vm.startEdit("m1")
        h.vm.onDraftChange("salut edited")
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")?.text).isEqualTo("keep me")
    }

    @Test
    fun startEdit_is_allowed_while_the_message_is_still_inside_the_two_hour_window() = runTest(dispatcher) {
        val h = harness(
            messageCreatedAt(senderId = "me", createdAt = "2026-07-07T11:30:00Z"),
            currentUser = me,
        )
        advanceUntilIdle()

        h.vm.startEdit("m1")

        assertThat(h.vm.state.value.editingMessageId).isEqualTo("m1")
        assertThat(h.vm.state.value.draft).isEqualTo("salut")
    }

    @Test
    fun startEdit_is_blocked_once_the_two_hour_edit_window_has_passed() = runTest(dispatcher) {
        val h = harness(
            messageCreatedAt(senderId = "me", createdAt = "2026-07-07T09:00:00Z"),
            currentUser = me,
        )
        advanceUntilIdle()

        h.vm.startEdit("m1")

        assertThat(h.vm.state.value.editingMessageId).isNull()
        assertThat(h.vm.state.value.draft).isEmpty()
    }

    @Test
    fun startEdit_refuses_a_message_the_current_user_does_not_own() = runTest(dispatcher) {
        val h = harness(
            messageCreatedAt(senderId = "other", createdAt = "2026-07-07T11:30:00Z"),
            currentUser = me,
        )
        advanceUntilIdle()

        h.vm.startEdit("m1")

        assertThat(h.vm.state.value.editingMessageId).isNull()
    }

    @Test
    fun header_carries_the_conversation_title_and_accent_color() = runTest(dispatcher) {
        val conversation = ApiConversation(id = "c1", title = "Équipe", type = "group")
        val h = harness(
            syncedConversation(),
            currentUser = me,
            conversation = conversation,
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.conversationTitle).isEqualTo("Équipe")
        assertThat(h.vm.state.value.accentColorHex).isEqualTo(conversation.accentHex())
    }

    @Test
    fun startReply_flags_the_composer_and_closes_the_sheet() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.onMessageLongPress("m1")
        h.vm.startReply("m1")

        assertThat(h.vm.state.value.replyingToMessageId).isEqualTo("m1")
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun send_attaches_the_replyToId_and_clears_the_reply_state() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.startReply("m1")
        h.vm.onDraftChange("re: salut")
        h.vm.send()
        advanceUntilIdle()

        coVerify {
            h.repo.sendOptimistic(
                conversationId = "c1",
                content = "re: salut",
                originalLanguage = "fr",
                sender = me,
                replyToId = "m1",
            )
        }
        assertThat(h.vm.state.value.replyingToMessageId).isNull()
    }

    @Test
    fun cancelReply_clears_the_banner_without_sending() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startReply("m1")
        h.vm.cancelReply()

        assertThat(h.vm.state.value.replyingToMessageId).isNull()
        coVerify(exactly = 0) { h.repo.sendOptimistic(any(), any(), any(), any(), any()) }
    }

    @Test
    fun arming_a_reply_persists_the_reply_reference_to_the_durable_store() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startReply("m1")
        advanceUntilIdle()

        val stored = h.draftStore.load("c1")
        assertThat(stored?.replyToId).isEqualTo("m1")
        assertThat(stored?.text).isEmpty()
    }

    @Test
    fun typing_under_an_armed_reply_persists_text_alongside_the_reply_reference() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startReply("m1")
        h.vm.onDraftChange("re: salut")
        advanceUntilIdle()

        val stored = h.draftStore.load("c1")
        assertThat(stored?.text).isEqualTo("re: salut")
        assertThat(stored?.replyToId).isEqualTo("m1")
    }

    @Test
    fun a_stored_reply_draft_re_arms_the_reply_when_the_conversation_opens() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf(
                "c1" to ConversationDraft(conversationId = "c1", text = "re: salut", replyToId = "m1"),
            ),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("re: salut")
        assertThat(h.vm.state.value.replyingToMessageId).isEqualTo("m1")
    }

    @Test
    fun a_draft_nav_argument_seeds_the_composer_immediately() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, initialDraftArg = "Thanks!")

        assertThat(h.vm.state.value.draft).isEqualTo("Thanks!")
    }

    @Test
    fun a_draft_nav_argument_takes_priority_over_a_stale_persisted_draft() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            initialDraftArg = "Thanks!",
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "old draft")),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("Thanks!")
    }

    @Test
    fun a_blank_draft_nav_argument_never_blocks_the_persisted_draft_restore() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            initialDraftArg = "",
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "old draft")),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.draft).isEqualTo("old draft")
    }

    @Test
    fun a_percent_encoded_draft_nav_argument_is_decoded() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, initialDraftArg = "Call%20me%20back")

        assertThat(h.vm.state.value.draft).isEqualTo("Call me back")
    }

    @Test
    fun a_malformed_percent_sequence_falls_back_to_the_raw_draft_text_instead_of_crashing() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me, initialDraftArg = "100% ready!")

        assertThat(h.vm.state.value.draft).isEqualTo("100% ready!")
    }

    @Test
    fun cancelling_a_reply_on_an_empty_composer_purges_the_stored_draft() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            drafts = mapOf("c1" to ConversationDraft(conversationId = "c1", text = "", replyToId = "m1")),
        )
        advanceUntilIdle()
        assertThat(h.vm.state.value.replyingToMessageId).isEqualTo("m1")

        h.vm.cancelReply()
        advanceUntilIdle()

        assertThat(h.vm.state.value.replyingToMessageId).isNull()
        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun sending_a_reply_purges_the_persisted_reply_draft() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.startReply("m1")
        h.vm.onDraftChange("re: salut")
        h.vm.send()
        advanceUntilIdle()

        assertThat(h.draftStore.load("c1")).isNull()
    }

    @Test
    fun startEdit_and_startReply_are_mutually_exclusive() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.startReply("m1")
        h.vm.startEdit("m1")
        assertThat(h.vm.state.value.replyingToMessageId).isNull()

        h.vm.startReply("m1")
        assertThat(h.vm.state.value.editingMessageId).isNull()
        assertThat(h.vm.state.value.replyingToMessageId).isEqualTo("m1")
    }

    @Test
    fun toggleShowOriginal_swaps_the_bubble_to_the_original_and_back() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        fun bubble() = h.vm.state.value.messages.first { it.messageId == "m1" }
        advanceUntilIdle()
        assertThat(bubble().text).isEqualTo("salut fr")

        h.vm.onMessageLongPress("m1")
        h.vm.toggleShowOriginal("m1")
        advanceUntilIdle()

        assertThat(bubble().text).isEqualTo("salut")
        assertThat(bubble().isShowingOriginal).isTrue()
        assertThat(h.vm.state.value.actionMessageId).isNull()

        h.vm.toggleShowOriginal("m1")
        advanceUntilIdle()
        assertThat(bubble().text).isEqualTo("salut fr")
    }

    @Test
    fun loadOlder_records_when_history_is_exhausted() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.loadOlder("c1") } returns false
        advanceUntilIdle()

        h.vm.loadOlder()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.loadOlder("c1") }
        assertThat(h.vm.state.value.hasMoreOlder).isFalse()
        assertThat(h.vm.state.value.isLoadingOlder).isFalse()
    }

    @Test
    fun loadOlder_is_single_flight_and_stops_once_exhausted() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.loadOlder("c1") } returns false
        advanceUntilIdle()

        h.vm.loadOlder()
        h.vm.loadOlder()
        advanceUntilIdle()
        h.vm.loadOlder()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.repo.loadOlder("c1") }
    }

    @Test
    fun loadOlder_skips_an_empty_conversation() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.loadOlder()
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.loadOlder(any(), any()) }
    }

    @Test
    fun loadOlder_failure_surfaces_the_error_and_keeps_pagination_enabled() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.loadOlder("c1") } throws RuntimeException("down")
        advanceUntilIdle()

        h.vm.loadOlder()
        advanceUntilIdle()

        assertThat(h.vm.state.value.errorMessage).isEqualTo("down")
        assertThat(h.vm.state.value.isLoadingOlder).isFalse()
        assertThat(h.vm.state.value.hasMoreOlder).isTrue()
    }

    @Test
    fun deleteForEveryone_delegates_to_the_repository_and_closes_the_sheet() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.deleteOptimistic(any()) } returns true
        advanceUntilIdle()

        h.vm.onMessageLongPress("m1")
        h.vm.deleteForEveryone("m1")
        advanceUntilIdle()

        coVerify { h.repo.deleteOptimistic("m1") }
        assertThat(h.vm.state.value.actionMessageId).isNull()
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
    }

    @Test
    fun deleteForMe_hides_the_message_locally_without_any_server_round_trip() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()
        assertThat(h.vm.state.value.messages.map { it.messageId }).containsExactly("m1", "m2")

        h.vm.onMessageLongPress("m2")
        h.vm.deleteForMe("m2")
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.map { it.messageId }).containsExactly("m1")
        assertThat(h.locallyHidden.hidden.value.isHidden("m2")).isTrue()
        assertThat(h.vm.state.value.actionMessageId).isNull()
        coVerify(exactly = 0) { h.repo.deleteOptimistic(any()) }
    }

    @Test
    fun a_previously_hidden_message_never_appears_in_the_bubble_list() = runTest(dispatcher) {
        val h = harness(
            syncedConversation(),
            currentUser = me,
            hidden = LocallyHiddenMessages(setOf("m1")),
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.messages.map { it.messageId }).containsExactly("m2")
    }

    @Test
    fun a_read_status_event_for_this_conversation_upgrades_own_bubbles() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        readStatusUpdated.emit(
            ReadStatusUpdatedEvent(
                conversationId = "c1",
                participantId = "p2",
                type = "read",
                updatedAt = "2026-06-12T10:00:00Z",
                summary = ReadStatusSummary(totalMembers = 3, deliveredCount = 2, readCount = 1),
            ),
        )
        advanceUntilIdle()

        coVerify {
            h.repo.applyReadReceipt(
                conversationId = "c1",
                ownSenderId = "me",
                deliveredCount = 2,
                readCount = 1,
                frontierIso = "2026-06-12T10:00:00Z",
            )
        }
    }

    @Test
    fun a_read_status_event_elsewhere_is_ignored() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        readStatusUpdated.emit(
            ReadStatusUpdatedEvent(
                conversationId = "other",
                participantId = "p2",
                summary = ReadStatusSummary(deliveredCount = 1, readCount = 1),
            ),
        )
        advanceUntilIdle()

        coVerify(exactly = 0) { h.repo.applyReadReceipt(any(), any(), any(), any(), any()) }
    }

    @Test
    fun first_keystroke_emits_a_single_typing_start() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("h")
        h.vm.onDraftChange("he")

        verify(exactly = 1) { h.socket.emitTypingStart("c1") }
        verify(exactly = 0) { h.socket.emitTypingStop(any()) }
    }

    @Test
    fun continuous_typing_reemits_after_the_interval() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("h")
        advanceTimeBy(2_000)
        h.vm.onDraftChange("he")
        advanceTimeBy(1_500)

        verify(exactly = 2) { h.socket.emitTypingStart("c1") }
        verify(exactly = 0) { h.socket.emitTypingStop(any()) }
    }

    @Test
    fun going_idle_emits_a_typing_stop() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("h")
        advanceTimeBy(3_100)

        verify(exactly = 1) { h.socket.emitTypingStop("c1") }
    }

    @Test
    fun clearing_the_draft_stops_typing_immediately() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("h")
        h.vm.onDraftChange("")

        verify(exactly = 1) { h.socket.emitTypingStop("c1") }
    }

    @Test
    fun sending_stops_the_typing_emission() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.repo.sendOptimistic(any(), any(), any(), any(), any()) } returns "cmid_1"
        advanceUntilIdle()

        h.vm.onDraftChange("hello")
        h.vm.send()
        advanceUntilIdle()

        verify(exactly = 1) { h.socket.emitTypingStop("c1") }
    }

    @Test
    fun an_empty_draft_never_emits_a_spurious_stop() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        h.vm.onDraftChange("")

        verify(exactly = 0) { h.socket.emitTypingStop(any()) }
        verify(exactly = 0) { h.socket.emitTypingStart(any()) }
    }

    @Test
    fun a_peer_typing_start_populates_the_typing_roster() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Bob"))
        runCurrent()

        assertThat(h.vm.state.value.typingParticipants)
            .containsExactly(TypingParticipant("u1", "Bob"))
    }

    @Test
    fun a_peer_typing_start_resolves_the_avatar_from_the_conversation_roster() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Bob"))
        runCurrent()

        assertThat(h.vm.state.value.typingParticipants.single().avatarUrl).isEqualTo("bob.png")
    }

    @Test
    fun a_peer_typing_start_without_a_roster_avatar_carries_no_avatar() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me, conversation = conversationWithRoster())
        advanceUntilIdle()

        typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u2", displayName = "Bobby"))
        runCurrent()

        assertThat(h.vm.state.value.typingParticipants.single().avatarUrl).isNull()
    }

    @Test
    fun typing_events_for_another_conversation_are_ignored() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        typingStarted.emit(TypingEvent(conversationId = "other", userId = "u1", displayName = "Bob"))
        runCurrent()

        assertThat(h.vm.state.value.typingParticipants).isEmpty()
    }

    @Test
    fun two_distinct_peers_who_share_a_name_both_show_and_stopping_one_leaves_the_other() =
        runTest(dispatcher) {
            val h = harness(flowOf(CacheResult.Empty), currentUser = me)
            advanceUntilIdle()

            typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alex"))
            runCurrent()
            typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u2", displayName = "Alex"))
            runCurrent()
            assertThat(h.vm.state.value.typingParticipants).hasSize(2)

            typingStopped.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Alex"))
            runCurrent()

            assertThat(h.vm.state.value.typingParticipants)
                .containsExactly(TypingParticipant("u2", "Alex"))
        }

    @Test
    fun a_peer_typing_start_expires_after_the_timeout() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()

        typingStarted.emit(TypingEvent(conversationId = "c1", userId = "u1", displayName = "Bob"))
        runCurrent()
        assertThat(h.vm.state.value.typingParticipants).hasSize(1)

        advanceTimeBy(6_000)
        advanceUntilIdle()

        assertThat(h.vm.state.value.typingParticipants).isEmpty()
    }

    private fun chatMessages(vararg contents: Pair<String, String>) = flowOf(
        CacheResult.Fresh(
            contents.map { (id, text) ->
                synced(ApiMessage(id = id, conversationId = "c1", senderId = "other", content = text))
            },
            ageMillis = 0,
        ),
    )

    @Test
    fun opening_search_and_typing_a_query_highlights_the_matching_bubbles() = runTest(dispatcher) {
        val h = harness(chatMessages("m1" to "Hello world", "m2" to "goodbye", "m3" to "hello again"), currentUser = me)
        advanceUntilIdle()

        h.vm.openSearch()
        h.vm.onSearchQueryChange("hello")

        val search = h.vm.state.value.search
        assertThat(search.isActive).isTrue()
        assertThat(search.matchIds).containsExactly("m1", "m3").inOrder()
        assertThat(search.activeMessageId).isEqualTo("m1")
        assertThat(search.currentPosition).isEqualTo(1)
        assertThat(search.matchCount).isEqualTo(2)
        assertThat(search.highlightTerm).isEqualTo("hello")
    }

    @Test
    fun next_and_previous_navigate_between_matches() = runTest(dispatcher) {
        val h = harness(chatMessages("m1" to "hello world", "m3" to "hello again"), currentUser = me)
        advanceUntilIdle()
        h.vm.openSearch()
        h.vm.onSearchQueryChange("hello")

        h.vm.nextSearchMatch()
        assertThat(h.vm.state.value.search.activeMessageId).isEqualTo("m3")

        h.vm.previousSearchMatch()
        assertThat(h.vm.state.value.search.activeMessageId).isEqualTo("m1")
    }

    @Test
    fun closing_search_clears_the_query_and_highlight() = runTest(dispatcher) {
        val h = harness(chatMessages("m1" to "hello"), currentUser = me)
        advanceUntilIdle()
        h.vm.openSearch()
        h.vm.onSearchQueryChange("hello")

        h.vm.closeSearch()

        val search = h.vm.state.value.search
        assertThat(search.isActive).isFalse()
        assertThat(search.query).isEmpty()
        assertThat(search.matchIds).isEmpty()
        assertThat(search.highlightTerm).isNull()
    }

    @Test
    fun search_reconciles_and_keeps_focus_when_a_new_matching_message_streams_in() = runTest(dispatcher) {
        val stream = MutableStateFlow<CacheResult<List<LocalMessage>>>(
            CacheResult.Fresh(
                listOf(
                    synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "hello world")),
                    synced(ApiMessage(id = "m3", conversationId = "c1", senderId = "other", content = "hello again")),
                ),
                ageMillis = 0,
            ),
        )
        val h = harness(stream, currentUser = me)
        advanceUntilIdle()
        h.vm.openSearch()
        h.vm.onSearchQueryChange("hello")
        h.vm.nextSearchMatch()
        assertThat(h.vm.state.value.search.activeMessageId).isEqualTo("m3")

        stream.value = CacheResult.Fresh(
            listOf(
                synced(ApiMessage(id = "m0", conversationId = "c1", senderId = "other", content = "hello newest")),
                synced(ApiMessage(id = "m1", conversationId = "c1", senderId = "other", content = "hello world")),
                synced(ApiMessage(id = "m3", conversationId = "c1", senderId = "other", content = "hello again")),
            ),
            ageMillis = 0,
        )
        advanceUntilIdle()

        val search = h.vm.state.value.search
        assertThat(search.matchIds).containsExactly("m0", "m1", "m3").inOrder()
        assertThat(search.activeMessageId).isEqualTo("m3")
    }

    @Test
    fun search_never_matches_deleted_messages() = runTest(dispatcher) {
        val h = harness(
            flowOf(
                CacheResult.Fresh(
                    listOf(
                        synced(
                            ApiMessage(
                                id = "gone",
                                conversationId = "c1",
                                senderId = "other",
                                content = "hello secret",
                                deletedAt = "2026-07-06T00:00:00Z",
                            ),
                        ),
                        synced(ApiMessage(id = "live", conversationId = "c1", senderId = "other", content = "hello there")),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = me,
        )
        advanceUntilIdle()
        h.vm.openSearch()

        h.vm.onSearchQueryChange("hello")

        assertThat(h.vm.state.value.search.matchIds).containsExactly("live")
    }

    private fun replyThread() = flowOf(
        CacheResult.Fresh(
            listOf(
                synced(ApiMessage(id = "orig", conversationId = "c1", senderId = "other", content = "the original")),
                synced(
                    ApiMessage(
                        id = "answer",
                        conversationId = "c1",
                        senderId = "other",
                        content = "the reply",
                        replyTo = ApiMessageReplyPreview(id = "orig", content = "the original"),
                    ),
                ),
                synced(ApiMessage(id = "plain", conversationId = "c1", senderId = "other", content = "no reply here")),
            ),
            ageMillis = 0,
        ),
    )

    @Test
    fun tapping_a_reply_whose_original_is_loaded_requests_a_scroll_to_it() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.onReplyPreviewTap("answer")

        assertThat(vm.state.value.scrollToMessageId).isEqualTo("orig")
    }

    @Test
    fun tapping_a_reply_to_a_paged_out_original_is_inert() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(
            flowOf(
                CacheResult.Fresh(
                    listOf(
                        synced(
                            ApiMessage(
                                id = "answer",
                                conversationId = "c1",
                                senderId = "other",
                                content = "the reply",
                                replyTo = ApiMessageReplyPreview(id = "gone", content = "old"),
                            ),
                        ),
                    ),
                    ageMillis = 0,
                ),
            ),
            currentUser = me,
        )
        advanceUntilIdle()

        vm.onReplyPreviewTap("answer")

        assertThat(vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun tapping_a_message_that_is_not_a_reply_is_inert() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.onReplyPreviewTap("plain")

        assertThat(vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun handling_the_scroll_clears_the_pending_reply_jump() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()
        vm.onReplyPreviewTap("answer")
        assertThat(vm.state.value.scrollToMessageId).isEqualTo("orig")

        vm.onScrollHandled()

        assertThat(vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun tapping_the_reply_count_pill_scrolls_to_the_first_reply_in_the_thread() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.onReplyCountTap("orig")

        assertThat(vm.state.value.scrollToMessageId).isEqualTo("answer")
    }

    @Test
    fun tapping_the_reply_count_on_a_message_with_no_replies_is_inert() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.onReplyCountTap("plain")

        assertThat(vm.state.value.scrollToMessageId).isNull()
    }

    @Test
    fun tapping_the_reply_count_on_a_parent_with_several_replies_anchors_on_the_earliest() =
        runTest(dispatcher) {
            val (vm, _, _) = viewModel(
                flowOf(
                    CacheResult.Fresh(
                        listOf(
                            synced(ApiMessage(id = "orig", conversationId = "c1", senderId = "other", content = "root")),
                            synced(
                                ApiMessage(
                                    id = "first",
                                    conversationId = "c1",
                                    senderId = "other",
                                    content = "first reply",
                                    replyTo = ApiMessageReplyPreview(id = "orig", content = "root"),
                                ),
                            ),
                            synced(
                                ApiMessage(
                                    id = "second",
                                    conversationId = "c1",
                                    senderId = "other",
                                    content = "second reply",
                                    replyTo = ApiMessageReplyPreview(id = "orig", content = "root"),
                                ),
                            ),
                        ),
                        ageMillis = 0,
                    ),
                ),
                currentUser = me,
            )
            advanceUntilIdle()

            vm.onReplyCountTap("orig")

            assertThat(vm.state.value.scrollToMessageId).isEqualTo("first")
        }

    @Test
    fun long_pressing_the_reply_pill_opens_the_focused_thread_overlay() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.openReplyThread("orig")

        val overlay = vm.state.value.replyThreadOverlay
        assertThat(overlay).isNotNull()
        assertThat(overlay!!.parentId).isEqualTo("orig")
        assertThat(overlay.replies.map { it.messageId }).containsExactly("answer")
    }

    @Test
    fun opening_the_thread_overlay_on_a_message_with_no_replies_is_inert() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()

        vm.openReplyThread("plain")

        assertThat(vm.state.value.replyThreadParentId).isNull()
        assertThat(vm.state.value.replyThreadOverlay).isNull()
    }

    @Test
    fun closing_the_thread_overlay_dismisses_it() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()
        vm.openReplyThread("orig")

        vm.closeReplyThread()

        assertThat(vm.state.value.replyThreadOverlay).isNull()
    }

    @Test
    fun tapping_a_reply_row_scrolls_to_it_and_closes_the_thread_overlay() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()
        vm.openReplyThread("orig")

        vm.onReplyThreadReplyTap("answer")

        assertThat(vm.state.value.scrollToMessageId).isEqualTo("answer")
        assertThat(vm.state.value.replyThreadOverlay).isNull()
    }

    @Test
    fun tapping_an_unknown_reply_row_leaves_the_thread_overlay_open() = runTest(dispatcher) {
        val (vm, _, _) = viewModel(replyThread(), currentUser = me)
        advanceUntilIdle()
        vm.openReplyThread("orig")

        vm.onReplyThreadReplyTap("ghost")

        assertThat(vm.state.value.scrollToMessageId).isNull()
        assertThat(vm.state.value.replyThreadOverlay).isNotNull()
    }

    @Test
    fun the_thread_overlay_auto_closes_when_its_replies_drain_while_open() = runTest(dispatcher) {
        // Standing invariant, not just an open()-time guard: if the only live reply is
        // deleted while the overlay is showing, close it rather than leave a dead-end
        // empty overlay — and require an explicit re-open for any later new reply.
        val stream = MutableStateFlow<CacheResult<List<LocalMessage>>>(
            CacheResult.Fresh(
                listOf(
                    synced(ApiMessage(id = "orig", conversationId = "c1", senderId = "other", content = "root")),
                    synced(
                        ApiMessage(
                            id = "answer",
                            conversationId = "c1",
                            senderId = "other",
                            content = "the reply",
                            replyTo = ApiMessageReplyPreview(id = "orig", content = "root"),
                        ),
                    ),
                ),
                ageMillis = 0,
            ),
        )
        val h = harness(stream, currentUser = me)
        advanceUntilIdle()
        h.vm.openReplyThread("orig")
        assertThat(h.vm.state.value.replyThreadOverlay).isNotNull()

        stream.value = CacheResult.Fresh(
            listOf(
                synced(ApiMessage(id = "orig", conversationId = "c1", senderId = "other", content = "root")),
                synced(
                    ApiMessage(
                        id = "answer",
                        conversationId = "c1",
                        senderId = "other",
                        content = "the reply",
                        replyTo = ApiMessageReplyPreview(id = "orig", content = "root"),
                        deletedAt = "2026-07-08T09:00:00Z",
                    ),
                ),
            ),
            ageMillis = 0,
        )
        advanceUntilIdle()

        assertThat(h.vm.state.value.replyThreadParentId).isNull()
        assertThat(h.vm.state.value.replyThreadOverlay).isNull()
    }

    @Test
    fun opening_reaction_details_shows_the_sheet_immediately_while_the_fetch_is_in_flight() =
        runTest(dispatcher) {
            val h = harness(flowOf(CacheResult.Empty), currentUser = me)
            advanceUntilIdle()

            h.vm.openReactionDetails("m1")

            // Synchronous state update precedes the launched fetch: sheet is up, loading.
            val details = h.vm.state.value.reactionDetails
            assertThat(details).isNotNull()
            assertThat(details!!.messageId).isEqualTo("m1")
            assertThat(details.isLoading).isTrue()
            assertThat(details.breakdown.isEmpty).isTrue()
        }

    @Test
    fun opening_reaction_details_fills_the_breakdown_from_the_fetch_and_flags_self() =
        runTest(dispatcher) {
            val h = harness(flowOf(CacheResult.Empty), currentUser = me)
            coEvery { h.reactions.fetchDetails("m1") } returns NetworkResult.Success(
                ReactionSyncResponse(
                    messageId = "m1",
                    reactions = listOf(
                        ReactionGroup(
                            emoji = "👍",
                            count = 2,
                            users = listOf(
                                ReactionUserDetail(userId = "a", username = "Alice"),
                                ReactionUserDetail(userId = "me", username = "atabeth"),
                            ),
                        ),
                    ),
                    userReactions = listOf("👍"),
                ),
            )
            advanceUntilIdle()

            h.vm.openReactionDetails("m1")
            advanceUntilIdle()

            val details = h.vm.state.value.reactionDetails!!
            assertThat(details.isLoading).isFalse()
            val tab = details.breakdown.tabs.single()
            assertThat(tab.count).isEqualTo(2)
            // Self floats to the top.
            assertThat(tab.reactors.first().isSelf).isTrue()
            assertThat(tab.reactors.first().userId).isEqualTo("me")
        }

    @Test
    fun a_failed_reaction_detail_fetch_leaves_an_empty_non_loading_sheet() =
        runTest(dispatcher) {
            val h = harness(flowOf(CacheResult.Empty), currentUser = me)
            // Harness default: fetchDetails fails.
            advanceUntilIdle()

            h.vm.openReactionDetails("m1")
            advanceUntilIdle()

            val details = h.vm.state.value.reactionDetails!!
            assertThat(details.isLoading).isFalse()
            assertThat(details.breakdown.isEmpty).isTrue()
        }

    @Test
    fun selecting_a_tab_updates_the_selection_and_out_of_range_is_inert() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.reactions.fetchDetails("m1") } returns NetworkResult.Success(
            ReactionSyncResponse(
                messageId = "m1",
                reactions = listOf(
                    ReactionGroup(emoji = "👍", count = 1, users = listOf(ReactionUserDetail("a", "Alice"))),
                    ReactionGroup(emoji = "❤️", count = 1, users = listOf(ReactionUserDetail("b", "Bob"))),
                ),
            ),
        )
        advanceUntilIdle()
        h.vm.openReactionDetails("m1")
        advanceUntilIdle()

        h.vm.selectReactionTab(1)
        assertThat(h.vm.state.value.reactionDetails!!.selectedTabIndex).isEqualTo(1)

        h.vm.selectReactionTab(99)
        assertThat(h.vm.state.value.reactionDetails!!.selectedTabIndex).isEqualTo(1)
    }

    @Test
    fun closing_reaction_details_clears_the_sheet() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()
        h.vm.openReactionDetails("m1")
        advanceUntilIdle()
        assertThat(h.vm.state.value.reactionDetails).isNotNull()

        h.vm.closeReactionDetails()

        assertThat(h.vm.state.value.reactionDetails).isNull()
    }

    // MARK: - report a message

    @Test
    fun opening_report_shows_the_sheet_and_closes_the_action_sheet() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()
        h.vm.onMessageLongPress("m9")

        h.vm.openReport("m9")

        val form = h.vm.state.value.reportForm
        assertThat(form).isNotNull()
        assertThat(form!!.messageId).isEqualTo("m9")
        assertThat(form.selectedReason).isEqualTo(ReportReason.SPAM)
        assertThat(h.vm.state.value.actionMessageId).isNull()
    }

    @Test
    fun selecting_a_reason_and_editing_details_updates_the_report_form() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()
        h.vm.openReport("m9")

        h.vm.selectReportReason(ReportReason.HATE_SPEECH)
        h.vm.onReportDetailsChange("uses slurs")

        val form = h.vm.state.value.reportForm!!
        assertThat(form.selectedReason).isEqualTo(ReportReason.HATE_SPEECH)
        assertThat(form.details).isEqualTo("uses slurs")
    }

    @Test
    fun submitting_a_report_sends_the_selection_and_latches_submitted() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.reportRepo.reportMessage(any(), any(), any()) } returns NetworkResult.Success(Unit)
        advanceUntilIdle()
        h.vm.openReport("m9")
        h.vm.selectReportReason(ReportReason.VIOLENCE)
        h.vm.onReportDetailsChange("threatened another member")

        h.vm.submitReport()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.reportRepo.reportMessage("m9", ReportReason.VIOLENCE, "threatened another member") }
        assertThat(h.vm.state.value.reportForm!!.isSubmitted).isTrue()
    }

    @Test
    fun a_failed_report_surfaces_an_error_and_stays_retryable() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.reportRepo.reportMessage(any(), any(), any()) } returns NetworkResult.Failure(ApiError("boom"))
        advanceUntilIdle()
        h.vm.openReport("m9")

        h.vm.submitReport()
        advanceUntilIdle()

        val form = h.vm.state.value.reportForm!!
        assertThat(form.hasError).isTrue()
        assertThat(form.canSubmit).isTrue()
    }

    @Test
    fun an_inert_report_with_no_session_surfaces_an_error() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.reportRepo.reportMessage(any(), any(), any()) } returns null
        advanceUntilIdle()
        h.vm.openReport("m9")

        h.vm.submitReport()
        advanceUntilIdle()

        assertThat(h.vm.state.value.reportForm!!.hasError).isTrue()
    }

    @Test
    fun a_double_submit_only_files_one_report() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        coEvery { h.reportRepo.reportMessage(any(), any(), any()) } returns NetworkResult.Success(Unit)
        advanceUntilIdle()
        h.vm.openReport("m9")

        h.vm.submitReport()
        h.vm.submitReport()
        advanceUntilIdle()

        coVerify(exactly = 1) { h.reportRepo.reportMessage(any(), any(), any()) }
    }

    @Test
    fun dismissing_report_clears_the_sheet() = runTest(dispatcher) {
        val h = harness(flowOf(CacheResult.Empty), currentUser = me)
        advanceUntilIdle()
        h.vm.openReport("m9")
        assertThat(h.vm.state.value.reportForm).isNotNull()

        h.vm.dismissReport()

        assertThat(h.vm.state.value.reportForm).isNull()
    }
}
