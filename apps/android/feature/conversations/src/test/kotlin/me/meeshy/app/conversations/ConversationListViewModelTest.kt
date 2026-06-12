package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
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
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
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

    private fun socketManager(): MessageSocketManager =
        mockk<MessageSocketManager> {
            every { unreadUpdated } returns MutableSharedFlow()
            every { messageReceived } returns MutableSharedFlow()
            every { conversationUpdated } returns MutableSharedFlow()
        }

    private fun connectionSocket(
        state: MutableStateFlow<SocketConnectionState> =
            MutableStateFlow(SocketConnectionState.DISCONNECTED),
    ): SocketManager = mockk<SocketManager> {
        every { connectionState } returns state
    }

    private fun session(): SessionRepository = mockk<SessionRepository> {
        every { currentUser } returns MutableStateFlow(null)
    }

    private fun viewModel(
        repo: ConversationRepository,
        connection: SocketManager = connectionSocket(),
    ) = ConversationListViewModel(repo, socketManager(), connection, session())

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
}
