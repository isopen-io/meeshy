package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostPage
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.session.SessionRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class NearbyViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(dispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val config = MeeshyConfig()

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    private fun page(vararg ids: String, nextCursor: String? = null, hasMore: Boolean = false) =
        NetworkResult.Success(PostPage(ids.map { post(it) }, nextCursor, hasMore))

    private fun viewModel(): NearbyViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        return NearbyViewModel(repository, session, config)
    }

    @Test
    fun `loadNearby fetches the first page and projects posts in the gateway's own order`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns
            page("a", "b", "c", hasMore = false)

        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id }).containsExactly("a", "b", "c").inOrder()
        }
    }

    @Test
    fun `loadNearby marks hasLocation and clears permissionDenied and locationUnavailable`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)

        val vm = viewModel()
        vm.onPermissionDenied()
        vm.loadNearby(48.85, 2.35)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.hasLocation).isTrue()
            assertThat(s.permissionDenied).isFalse()
            assertThat(s.locationUnavailable).isFalse()
        }
    }

    @Test
    fun `a failed first page surfaces errorMessage and does not mark the list loaded`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns
            NetworkResult.Failure(ApiError("boom"))

        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)

        vm.state.test {
            val s = awaitItem()
            assertThat(s.errorMessage).isEqualTo("boom")
            assertThat(s.posts).isEmpty()
        }
    }

    @Test
    fun `loadMoreIfNeeded near the tail fetches the next page with the same coordinates and appends without duplicates`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns
            page("a", "b", "c", nextCursor = "c2", hasMore = true)
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, "c2", any()) } returns
            page("c", "d", hasMore = false)

        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)
        vm.loadMoreIfNeeded("c")

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id })
                .containsExactly("a", "b", "c", "d").inOrder()
        }
        coVerify(exactly = 1) { repository.getNearbyPage(48.85, 2.35, 25.0, "c2", any()) }
    }

    @Test
    fun `loadMoreIfNeeded is a no-op when canLoadMore is false`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns
            page("a", "b", "c", nextCursor = null, hasMore = false)

        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)
        vm.loadMoreIfNeeded("c")

        coVerify(exactly = 1) { repository.getNearbyPage(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `refresh re-queries the last known coordinates and resets the list`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returnsMany
            listOf(page("a", "b", hasMore = false), page("x", hasMore = false))

        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)
        vm.refresh()

        vm.state.test {
            assertThat(awaitItem().posts.map { it.id }).containsExactly("x")
        }
        coVerify(exactly = 2) { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) }
    }

    @Test
    fun `refresh is a no-op before any coordinates are known`() = runTest {
        val vm = viewModel()
        vm.refresh()

        coVerify(exactly = 0) { repository.getNearbyPage(any(), any(), any(), any(), any()) }
    }

    @Test
    fun `refresh keeps the current posts visible until the new page arrives`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)
        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)

        val gate = CompletableDeferred<NetworkResult<PostPage>>()
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } coAnswers { gate.await() }
        vm.refresh()

        val midFlight = vm.state.value
        assertThat(midFlight.posts.map { it.id }).containsExactly("a")
        assertThat(midFlight.isRefreshing).isTrue()

        gate.complete(page("x", hasMore = false))

        val settled = vm.state.value
        assertThat(settled.posts.map { it.id }).containsExactly("x")
        assertThat(settled.isRefreshing).isFalse()
    }

    @Test
    fun `refresh leaves the previous posts visible after a failed refresh`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)
        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)

        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns
            NetworkResult.Failure(ApiError("boom"))
        vm.refresh()

        val s = vm.state.value
        assertThat(s.posts.map { it.id }).containsExactly("a")
        assertThat(s.errorMessage).isEqualTo("boom")
    }

    @Test
    fun `refresh is a no-op while a refresh is already in flight`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)
        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)

        val gate = CompletableDeferred<NetworkResult<PostPage>>()
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } coAnswers { gate.await() }
        vm.refresh()
        vm.refresh()

        coVerify(exactly = 2) { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) }
        gate.complete(page("x", hasMore = false))
    }

    @Test
    fun `loadNearby is a no-op once the list has already loaded`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)
        val vm = viewModel()
        vm.loadNearby(48.85, 2.35)
        vm.loadNearby(48.85, 2.35)

        coVerify(exactly = 1) { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) }
    }

    @Test
    fun `onLocating marks the state as locating`() = runTest {
        val vm = viewModel()
        vm.onLocating()

        assertThat(vm.state.value.isLocating).isTrue()
    }

    @Test
    fun `loadNearby clears isLocating once the fetch starts`() = runTest {
        coEvery { repository.getNearbyPage(48.85, 2.35, 25.0, null, any()) } returns page("a", hasMore = false)
        val vm = viewModel()
        vm.onLocating()
        vm.loadNearby(48.85, 2.35)

        assertThat(vm.state.value.isLocating).isFalse()
    }

    @Test
    fun `onPermissionDenied clears isLocating`() = runTest {
        val vm = viewModel()
        vm.onLocating()
        vm.onPermissionDenied()

        assertThat(vm.state.value.isLocating).isFalse()
    }

    @Test
    fun `onLocationUnavailable clears isLocating`() = runTest {
        val vm = viewModel()
        vm.onLocating()
        vm.onLocationUnavailable()

        assertThat(vm.state.value.isLocating).isFalse()
    }

    @Test
    fun `onPermissionDenied sets permissionDenied and clears loading`() = runTest {
        val vm = viewModel()
        vm.onPermissionDenied()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.permissionDenied).isTrue()
            assertThat(s.isLoading).isFalse()
        }
    }

    @Test
    fun `onLocationUnavailable sets locationUnavailable and clears loading`() = runTest {
        val vm = viewModel()
        vm.onLocationUnavailable()

        vm.state.test {
            val s = awaitItem()
            assertThat(s.locationUnavailable).isTrue()
            assertThat(s.isLoading).isFalse()
        }
    }
}
