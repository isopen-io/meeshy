package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
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

    @Test
    fun fresh_result_populates_conversations_without_skeleton() = runTest(dispatcher) {
        val repo = repositoryReturning(
            flowOf(CacheResult.Fresh(listOf(ApiConversation(id = "c1", title = "Team")))),
        )
        val vm = ConversationListViewModel(repo)
        advanceUntilIdle()

        assertThat(vm.state.value.conversations).hasSize(1)
        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.isSyncing).isFalse()
    }

    @Test
    fun empty_result_shows_the_skeleton() = runTest(dispatcher) {
        val vm = ConversationListViewModel(repositoryReturning(flowOf(CacheResult.Empty)))
        advanceUntilIdle()

        assertThat(vm.state.value.showSkeleton).isTrue()
        assertThat(vm.state.value.conversations).isEmpty()
    }

    @Test
    fun stale_result_keeps_data_and_marks_syncing() = runTest(dispatcher) {
        val vm = ConversationListViewModel(
            repositoryReturning(flowOf(CacheResult.Stale(listOf(ApiConversation(id = "c1"))))),
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
        val vm = ConversationListViewModel(repo)
        advanceUntilIdle()

        onError.captured.invoke(RuntimeException("Server down"))

        assertThat(vm.state.value.errorMessage).isEqualTo("Server down")
        assertThat(vm.state.value.showSkeleton).isFalse()
    }

    @Test
    fun refresh_failure_surfaces_the_error_message() = runTest(dispatcher) {
        val repo = repositoryReturning(flowOf(CacheResult.Empty))
        coEvery { repo.refresh() } throws RuntimeException("Network unavailable")
        val vm = ConversationListViewModel(repo)
        advanceUntilIdle()

        vm.refresh()
        advanceUntilIdle()

        assertThat(vm.state.value.errorMessage).isEqualTo("Network unavailable")
    }
}
