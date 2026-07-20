package me.meeshy.app.conversations

import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
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
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.chat.ConversationDraftStore
import me.meeshy.sdk.chat.InMemoryConversationDraftStore
import me.meeshy.sdk.chat.InMemoryStarredMessagesStore
import me.meeshy.sdk.chat.StarredMessagesStore
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.ConversationDeletedSocketEvent
import me.meeshy.sdk.model.ConversationDraft
import me.meeshy.sdk.model.ConversationFilter
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.ParticipantLeftEvent
import me.meeshy.sdk.model.StarredMessage
import me.meeshy.sdk.model.StarredMessages
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.MessageSocketManager
import me.meeshy.sdk.socket.SocketConnectionState
import me.meeshy.sdk.socket.SocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ConversationListViewModelTest {

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
        participantLeft: MutableSharedFlow<ParticipantLeftEvent> = MutableSharedFlow(),
    ): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { unreadUpdated } returns MutableSharedFlow()
            every { messageReceived } returns MutableSharedFlow()
            every { conversationUpdated } returns MutableSharedFlow()
            every { this@mockk.conversationDeleted } returns conversationDeleted
            every { this@mockk.participantLeft } returns participantLeft
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

    private fun viewModel(
        repo: ConversationRepository,
        connection: SocketManager = connectionSocket(),
        draftStore: ConversationDraftStore = InMemoryConversationDraftStore(),
        socket: MessageSocketManager = socketManager(),
        starredStore: StarredMessagesStore = InMemoryStarredMessagesStore(),
        session: SessionRepository = session(),
    ) = ConversationListViewModel(repo, socket, workManager, draftStore, starredStore, connection, session)

    @Test
    fun fresh_result_populates_conversations_without_skeleton() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun a_conversation_with_a_stored_draft_floats_to_the_top() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"), ApiConversation(id = "c3")),
                    ageMillis = 0,
                ),
            ),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c3" to ConversationDraft(conversationId = "c3", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c3", "c1", "c2").inOrder()
        assertThat(vm.state.value.draftFor("c3")?.text).isEqualTo("unsent")
    }

    @Test
    fun discarding_a_draft_clears_the_preview_and_sinks_the_row() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1"), ApiConversation(id = "c2"), ApiConversation(id = "c3")),
                    ageMillis = 0,
                ),
            ),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c3" to ConversationDraft(conversationId = "c3", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        vm.discardDraft("c3")
        advanceUntilIdle()

        assertThat(vm.state.value.draftFor("c3")).isNull()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c1", "c2", "c3").inOrder()
        assertThat(draftStore.load("c3")).isNull()
    }

    @Test
    fun discarding_a_draft_gives_instant_optimistic_feedback_before_the_store_settles() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val draftStore = InMemoryConversationDraftStore(
            mapOf("c1" to ConversationDraft(conversationId = "c1", text = "unsent")),
        )
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        // No advanceUntilIdle: the optimistic state update is synchronous.
        vm.discardDraft("c1")

        assertThat(vm.state.value.draftFor("c1")).isNull()
    }

    @Test
    fun discarding_when_no_meaningful_draft_exists_is_a_no_op() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val blank = ConversationDraft(conversationId = "c1", text = "   ")
        val draftStore = InMemoryConversationDraftStore(mapOf("c1" to blank))
        val vm = viewModel(repo, draftStore = draftStore)
        advanceUntilIdle()

        vm.discardDraft("c1")
        advanceUntilIdle()

        // The inert draft is left untouched — the affordance is never offered for it.
        assertThat(draftStore.load("c1")).isEqualTo(blank)
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun discarding_an_unknown_conversation_changes_nothing() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.discardDraft("does-not-exist")
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("c1")
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Empty)))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
        assertThat(vm.state.value.conversations).isEmpty()
    }

    @Test
    fun stale_result_keeps_data_and_marks_syncing() = runTest(dispatcher) {
        val vm = viewModel(
            repositoryReturning(flowOf(CacheResult.Stale(listOf(ApiConversation(id = "c1")), ageMillis = 0))),
        )
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.isSyncing).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun background_sync_error_clears_skeleton_and_surfaces_message() = runTest(dispatcher) {
        val repo = mockk<ConversationRepository>(relaxed = true)
        val onError = slot<(Throwable) -> Unit>()
        every { repo.conversationsStream(any(), capture(onError)) } returns flowOf(CacheResult.Empty)
        val vm = viewModel(repo)
        advanceUntilIdle()

        onError.captured.invoke(RuntimeException("Server down"))

        assertThat(vm.state.value.errorMessage).isEqualTo("Server down")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun refresh_failure_surfaces_the_error_message() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        coEvery { repo.refresh() } throws RuntimeException("Network unavailable")
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Network unavailable")
        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }

    @Test
    fun pull_to_refresh_spinner_tracks_the_user_gesture_only() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Stale(
                    listOf(ApiConversation(id = "c1", title = "Team")),
                    ageMillis = 0,
                ),
            ),
        )
        val vm = viewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.isSyncing).isTrue()
        assertThat(vm.state.value.isUserRefreshing).isFalse()

        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.isUserRefreshing).isFalse()
    }

    @Test
    fun selecting_a_filter_narrows_the_visible_list() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "read", title = "Read", unreadCount = 0),
            ApiConversation(id = "unread", title = "Unread", unreadCount = 4),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).hasSize(2)

        vm.selectFilter(ConversationFilter.UNREAD)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("unread")
        assertThat(vm.state.value.selectedFilter).isEqualTo(ConversationFilter.UNREAD)
    }

    @Test
    fun search_filters_by_title_and_flags_filtered_empty() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "a", title = "Design Team"),
            ApiConversation(id = "b", title = "Operations"),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()

        vm.setSearch("design")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("a")

        vm.setSearch("zzz")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).isEmpty()
        assertThat(vm.state.value.isFilteredEmpty).isTrue()
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun closing_search_clears_the_query_and_restores_the_list() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "a", title = "Design Team"),
            ApiConversation(id = "b", title = "Operations"),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()

        vm.setSearchActive(true)
        vm.setSearch("design")
        advanceUntilIdle()
        assertThat(vm.state.value.conversations).hasSize(1)

        vm.setSearchActive(false)
        advanceUntilIdle()

        assertThat(vm.state.value.searchText).isEmpty()
        assertThat(vm.state.value.isSearchActive).isFalse()
        assertThat(vm.state.value.conversations).hasSize(2)
    }

    @Test
    fun archived_conversations_are_hidden_from_all_filter_but_shown_under_archived() = runTest(dispatcher) {
        val convs = listOf(
            ApiConversation(id = "live", title = "Live"),
            ApiConversation(
                id = "old",
                title = "Old",
                preferences = ApiConversationPreferences(isArchived = true),
            ),
        )
        val vm = viewModel(repositoryReturning(flowOf(CacheResult.Fresh(convs, ageMillis = 0))))
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("live")

        vm.selectFilter(ConversationFilter.ARCHIVED)
        advanceUntilIdle()
        assertThat(vm.state.value.conversations.map { it.id }).containsExactly("old")
    }

    @Test
    fun the_banner_follows_the_socket_connection_state() = runTest(dispatcher) {
        val connection = MutableStateFlow(SocketConnectionState.CONNECTING)
        val repo = repositoryReturning(
            flowOf(
                CacheResult.Fresh(
                    listOf(ApiConversation(id = "c1", title = "Team")),
                    ageMillis = 0,
                ),
            ),
        )
        val vm = viewModel(repo, connectionSocket(connection))
        advanceUntilIdle()

        assertThat(vm.state.value.banner).isEqualTo(ConnectionBanner.RECONNECTING)

        connection.value = SocketConnectionState.CONNECTED
        advanceUntilIdle()

        assertThat(vm.state.value.banner).isEqualTo(ConnectionBanner.HIDDEN)
    }

    @Test
    fun toggle_pin_flips_the_cached_state_and_schedules_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")), ageMillis = 0)),
        )
        coEvery { repo.setPinnedOptimistic("c1", true) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.togglePin("c1")
        advanceUntilIdle()

        coVerify { repo.setPinnedOptimistic("c1", true) }
        verify { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    @Test
    fun toggle_pin_unpins_an_already_pinned_conversation() = runTest(dispatcher) {
        val pinned = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = ApiConversationPreferences(isPinned = true),
        )
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(pinned), ageMillis = 0)))
        coEvery { repo.setPinnedOptimistic("c1", false) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.togglePin("c1")
        advanceUntilIdle()

        coVerify { repo.setPinnedOptimistic("c1", false) }
    }

    @Test
    fun toggle_archive_toggles_and_mute_toggles_independently() = runTest(dispatcher) {
        val conv = ApiConversation(
            id = "c1",
            title = "Team",
            preferences = ApiConversationPreferences(isMuted = true),
        )
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(conv), ageMillis = 0)))
        coEvery { repo.setArchivedOptimistic("c1", true) } returns true
        coEvery { repo.setMutedOptimistic("c1", false) } returns true
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.toggleArchive("c1")
        vm.toggleMute("c1")
        advanceUntilIdle()

        coVerify { repo.setArchivedOptimistic("c1", true) }
        coVerify { repo.setMutedOptimistic("c1", false) }
    }

    @Test
    fun a_no_op_mutation_does_not_schedule_a_flush() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)),
        )
        coEvery { repo.markReadOptimistic("c1") } returns false
        val vm = viewModel(repo)
        advanceUntilIdle()

        vm.markRead("c1")
        advanceUntilIdle()

        verify(exactly = 0) { workManager.enqueue(any<androidx.work.WorkRequest>()) }
    }

    private fun star(conversationId: String, messageId: String = "m-$conversationId") =
        StarredMessage(messageId = messageId, conversationId = conversationId)

    @Test
    fun a_deleted_conversation_sheds_its_stars_and_refreshes_the_list() = runTest(dispatcher) {
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"), star("c2"))))
        val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
        advanceUntilIdle()

        deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
        advanceUntilIdle()

        // c1's bookmark is gone; c2's survives.
        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c2")
        coVerify { repo.refresh() }
    }

    @Test
    fun a_blank_delete_event_touches_neither_the_stars_nor_the_network() = runTest(dispatcher) {
        val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
        advanceUntilIdle()

        deleted.emit(ConversationDeletedSocketEvent(conversationId = "  "))
        advanceUntilIdle()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c1")
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun the_current_user_leaving_sheds_that_conversation_stars_and_refreshes() = runTest(dispatcher) {
        val left = MutableSharedFlow<ParticipantLeftEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(
            repo,
            socket = socketManager(participantLeft = left),
            starredStore = stars,
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "me"))
        advanceUntilIdle()

        assertThat(stars.starred.value.items).isEmpty()
        coVerify { repo.refresh() }
    }

    @Test
    fun another_participant_leaving_leaves_my_stars_and_list_untouched() = runTest(dispatcher) {
        val left = MutableSharedFlow<ParticipantLeftEvent>()
        val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
        val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
        val vm = viewModel(
            repo,
            socket = socketManager(participantLeft = left),
            starredStore = stars,
            session = session(userId = "me"),
        )
        advanceUntilIdle()

        left.emit(ParticipantLeftEvent(conversationId = "c1", userId = "someone-else"))
        advanceUntilIdle()

        assertThat(stars.starred.value.items.map { it.conversationId }).containsExactly("c1")
        coVerify(exactly = 0) { repo.refresh() }
    }

    @Test
    fun the_star_cleanup_survives_a_failing_refresh_without_crashing_or_surfacing_an_error() =
        runTest(dispatcher) {
            val deleted = MutableSharedFlow<ConversationDeletedSocketEvent>()
            val repo = repositoryReturning(flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1")), ageMillis = 0)))
            coEvery { repo.refresh() } throws RuntimeException("offline")
            val stars = InMemoryStarredMessagesStore(StarredMessages(listOf(star("c1"))))
            val vm = viewModel(repo, socket = socketManager(conversationDeleted = deleted), starredStore = stars)
            advanceUntilIdle()

            deleted.emit(ConversationDeletedSocketEvent(conversationId = "c1"))
            advanceUntilIdle()

            // The local star cleanup happened regardless of the refresh outcome; the
            // background failure stays silent (no user-facing error banner).
            assertThat(stars.starred.value.items).isEmpty()
            assertThat(vm.state.value.errorMessage).isNull()
        }
}
