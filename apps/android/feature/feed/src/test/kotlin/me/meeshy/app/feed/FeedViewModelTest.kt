package me.meeshy.app.feed

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.post.PostRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelTest {

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

    private fun post(id: String) = ApiPost(id = id, content = "Post $id")

    @Test
    fun `shows skeleton on cold cache`() = runTest {
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Empty)

        val vm = FeedViewModel(repository)
        vm.state.test {
            val s = awaitItem()
            assertThat(s.showSkeleton).isTrue()
            assertThat(s.posts).isEmpty()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows posts on fresh cache`() = runTest {
        val posts = listOf(post("1"), post("2"))
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, 1000L))

        val vm = FeedViewModel(repository)
        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts).hasSize(2)
            assertThat(s.showSkeleton).isFalse()
            assertThat(s.isSyncing).isFalse()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `shows posts with syncing indicator on stale cache`() = runTest {
        val posts = listOf(post("1"))
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Stale(posts, 5000L))

        val vm = FeedViewModel(repository)
        vm.state.test {
            val s = awaitItem()
            assertThat(s.posts).hasSize(1)
            assertThat(s.isSyncing).isTrue()
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `surfaces sync error to ui state`() = runTest {
        every { repository.feedStream(any(), captureLambda()) } answers {
            val onError = lambda<(Throwable) -> Unit>().captured
            onError(RuntimeException("timeout"))
            flowOf(CacheResult.Empty)
        }

        val vm = FeedViewModel(repository)
        vm.state.test {
            skipItems(1) // initial empty
            cancelAndIgnoreRemainingEvents()
        }
        assertThat(vm.state.value.errorMessage).isEqualTo("timeout")
    }
}
