package me.meeshy.app.stories

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.StoryViewer
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewersViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val repo: StoryRepository = mockk(relaxed = true)

    private fun viewer(id: String, viewedAt: String? = null, reaction: String? = null) =
        StoryViewer(
            id = id,
            username = id,
            displayName = id,
            avatarUrl = null,
            viewedAt = viewedAt,
            reactionEmoji = reaction,
        )

    @Test
    fun load_success_populatesOrderedViewers() = runTest {
        coEvery { repo.viewers("s1") } returns NetworkResult.Success(
            listOf(viewer("a", "2026-06-17T09:00:00Z"), viewer("b", "2026-06-17T11:00:00Z")),
        )
        val vm = StoryViewersViewModel(repo)

        vm.load("s1")

        val state = vm.state.value
        // most-recent-first ordering from StoryViewersPresentation is applied
        assertThat(state.viewers.map { it.id }).containsExactly("b", "a").inOrder()
        assertThat(state.isLoading).isFalse()
        assertThat(state.isEmpty).isFalse()
        assertThat(state.errorMessage).isNull()
    }

    @Test
    fun load_emptySuccess_isEmptyWithoutError() = runTest {
        coEvery { repo.viewers("s1") } returns NetworkResult.Success(emptyList())
        val vm = StoryViewersViewModel(repo)

        vm.load("s1")

        assertThat(vm.state.value.isEmpty).isTrue()
        assertThat(vm.state.value.errorMessage).isNull()
    }

    @Test
    fun load_coldFailure_surfacesError() = runTest {
        coEvery { repo.viewers("s1") } returns NetworkResult.Failure(ApiError("network down"))
        val vm = StoryViewersViewModel(repo)

        vm.load("s1")

        assertThat(vm.state.value.errorMessage).isEqualTo("network down")
        assertThat(vm.state.value.viewers).isEmpty()
        // an error state is not the empty state
        assertThat(vm.state.value.isEmpty).isFalse()
    }

    @Test
    fun load_coldException_surfacesMessage() = runTest {
        coEvery { repo.viewers("s1") } throws RuntimeException("kaboom")
        val vm = StoryViewersViewModel(repo)

        vm.load("s1")

        assertThat(vm.state.value.errorMessage).isEqualTo("kaboom")
    }

    @Test
    fun refreshFailure_keepsExistingViewers_andClearsNoData() = runTest {
        coEvery { repo.viewers("s1") } returns
            NetworkResult.Success(listOf(viewer("a", "2026-06-17T09:00:00Z")))
        val vm = StoryViewersViewModel(repo)
        vm.load("s1")
        assertThat(vm.state.value.viewers).hasSize(1)

        coEvery { repo.viewers("s1") } returns NetworkResult.Failure(ApiError("flaky"))
        vm.load("s1")

        // Instant-App: a refresh failure leaves the existing list on screen, no error
        assertThat(vm.state.value.viewers.map { it.id }).containsExactly("a")
        assertThat(vm.state.value.errorMessage).isNull()
        assertThat(vm.state.value.isLoading).isFalse()
    }

    @Test
    fun load_coldLoad_showsSkeletonThenList() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<StoryViewer>>>()
        coEvery { repo.viewers("s1") } coAnswers { gate.await() }
        val vm = StoryViewersViewModel(repo)

        vm.state.test {
            assertThat(awaitItem().isLoading).isFalse() // initial idle
            vm.load("s1")
            assertThat(awaitItem().isLoading).isTrue() // cold skeleton

            gate.complete(NetworkResult.Success(listOf(viewer("a", "2026-06-17T09:00:00Z"))))
            val loaded = awaitItem()
            assertThat(loaded.isLoading).isFalse()
            assertThat(loaded.viewers).hasSize(1)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun load_isReentrancySafe_whileInFlightForSameStory() = runTest {
        val gate = CompletableDeferred<NetworkResult<List<StoryViewer>>>()
        coEvery { repo.viewers("s1") } coAnswers { gate.await() }
        val vm = StoryViewersViewModel(repo)

        vm.load("s1")
        vm.load("s1") // ignored — a load for s1 is already in flight
        gate.complete(NetworkResult.Success(emptyList()))

        coVerify(exactly = 1) { repo.viewers("s1") }
    }
}
