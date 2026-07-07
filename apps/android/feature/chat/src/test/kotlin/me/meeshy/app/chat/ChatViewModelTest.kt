package me.meeshy.app.chat

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.justRun
import io.mockk.mockk
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
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.conversation.LocalSendState
import me.meeshy.sdk.conversation.MessageRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiMessageReplyPreview
import me.meeshy.sdk.model.ApiParticipant
import me.meeshy.sdk.model.ApiTextTranslation
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ReactionSyncResponse
import me.meeshy.sdk.model.ReactionUpdateEvent
import me.meeshy.sdk.model.ReadStatusSummary
import me.meeshy.sdk.model.ReadStatusUpdatedEvent
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.reaction.InMemoryEmojiUsageStore
import me.meeshy.sdk.reaction.ReactionRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
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

    private val reactionAdded = MutableSharedFlow<ReactionUpdateEvent>()
    private val reactionRemoved = MutableSharedFlow<ReactionUpdateEvent>()
    private val messageReceived = MutableSharedFlow<ApiMessage>()
    private val readStatusUpdated = MutableSharedFlow<ReadStatusUpdatedEvent>()

    private fun socketManager(): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { this@mockk.messageReceived } returns this@ChatViewModelTest.messageReceived
            every { messageUpdated } returns MutableSharedFlow()
            every { messageDeleted } returns MutableSharedFlow()
            every { typingStarted } returns MutableSharedFlow()
            every { typingStopped } returns MutableSharedFlow()
            every { this@mockk.reactionAdded } returns this@ChatViewModelTest.reactionAdded
            every { this@mockk.reactionRemoved } returns this@ChatViewModelTest.reactionRemoved
            every { this@mockk.readStatusUpdated } returns this@ChatViewModelTest.readStatusUpdated
            justRun { emitTypingStart(any()) }
            justRun { emitTypingStop(any()) }
        }

    private data class Harness(
        val vm: ChatViewModel,
        val repo: MessageRepository,
        val workManager: WorkManager,
        val reactions: ReactionRepository,
        val conversations: ConversationRepository,
        val socket: MessageSocketManager,
        val emojiUsage: InMemoryEmojiUsageStore,
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
    ): Harness {
        val repo = mockk<MessageRepository>(relaxed = true)
        every { repo.messagesStream(any(), any(), any()) } returns stream
        val conversations = mockk<ConversationRepository>(relaxed = true)
        every { conversations.conversationStream("c1") } returns MutableStateFlow(conversation)
        val session = mockk<SessionRepository>(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(currentUser)
        val reactions = mockk<ReactionRepository>(relaxed = true)
        coEvery { reactions.fetchDetails(any()) } returns
            NetworkResult.Failure(ApiError("offline"))
        val workManager = mockk<WorkManager>(relaxed = true)
        val handle = SavedStateHandle(mapOf(ChatViewModel.CONVERSATION_ID_ARG to "c1"))
        val socket = socketManager()
        val emojiUsage = InMemoryEmojiUsageStore()
        return Harness(
            ChatViewModel(
                repo,
                conversations,
                session,
                reactions,
                emojiUsage,
                socket,
                workManager,
                MeeshyConfig(),
                handle,
            ),
            repo,
            workManager,
            reactions,
            conversations,
            socket,
            emojiUsage,
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
            ApiParticipant(id = "p1", userId = "u1", username = "bob", displayName = "Bob Martin"),
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

    private val me = MeeshyUser(id = "me", username = "atabeth", systemLanguage = "fr")

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

    @Test
    fun tapping_an_image_opens_the_viewer_and_dismissing_clears_it() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        advanceUntilIdle()

        h.vm.openImageViewer("m2", 1)
        assertThat(h.vm.state.value.imageViewer).isEqualTo(ImageViewerTarget("m2", 1))

        h.vm.dismissImageViewer()
        assertThat(h.vm.state.value.imageViewer).isNull()
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
    fun deleteMessage_delegates_and_closes_the_sheet() = runTest(dispatcher) {
        val h = harness(syncedConversation(), currentUser = me)
        coEvery { h.repo.deleteOptimistic(any()) } returns true
        advanceUntilIdle()

        h.vm.onMessageLongPress("m1")
        h.vm.deleteMessage("m1")
        advanceUntilIdle()

        coVerify { h.repo.deleteOptimistic("m1") }
        assertThat(h.vm.state.value.actionMessageId).isNull()
        coVerify { h.workManager.enqueue(any<androidx.work.OneTimeWorkRequest>()) }
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
}
