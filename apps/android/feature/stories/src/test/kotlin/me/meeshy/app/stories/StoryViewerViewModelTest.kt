package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerViewModelTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val storyRepository: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val config = MeeshyConfig()

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()
    private fun isoAgo(hours: Long) = Instant.ofEpochMilli(now - hours * 3_600_000).toString()

    private fun storyPost(id: String, authorId: String, hoursAgo: Long) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = isoAgo(hoursAgo),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
    )

    private fun viewModel(
        startUserId: String,
        posts: List<ApiPost>,
    ): StoryViewerViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(posts)
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to startUserId))
        return StoryViewerViewModel(storyRepository, session, config, handle)
    }

    // Group "a"'s latest story is the newest overall so it sorts first; "b" follows.
    // Each group's slides are ordered oldest-first, so b1 must predate b2.
    private fun twoAuthors() = listOf(
        storyPost("a1", "a", hoursAgo = 1),
        storyPost("b1", "b", hoursAgo = 3),
        storyPost("b2", "b", hoursAgo = 2),
    )

    @Test
    fun `load positions on the requested user's group and exposes its slides`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.state.test {
            val s = awaitItem()
            assertThat(s.isLoading).isFalse()
            assertThat(s.authorName).isEqualTo("name-b")
            assertThat(s.slides.map { it.id }).containsExactly("b1", "b2").inOrder()
            assertThat(s.index).isEqualTo(0)
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test
    fun `advance walks within a group then rolls into the next group`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        assertThat(vm.state.value.authorName).isEqualTo("name-a")

        vm.advance() // past a's only slide → group b
        assertThat(vm.state.value.authorName).isEqualTo("name-b")
        assertThat(vm.state.value.current?.id).isEqualTo("b1")

        vm.advance() // b1 → b2
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.isDismissed).isFalse()
    }

    @Test
    fun `advancing past the final slide dismisses the viewer`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        vm.advance() // → b1
        vm.advance() // → b2
        vm.advance() // past last → dismissed
        assertThat(vm.state.value.isDismissed).isTrue()
    }

    @Test
    fun `back from a group's first slide rolls to the previous group`() = runTest {
        val vm = viewModel(startUserId = "a", posts = twoAuthors())
        vm.advance() // → group b, b1
        vm.back() // → previous group a, last slide
        assertThat(vm.state.value.authorName).isEqualTo("name-a")
        assertThat(vm.state.value.current?.id).isEqualTo("a1")
    }

    @Test
    fun `markCurrentViewed reports the current slide to the repository`() = runTest {
        val vm = viewModel(startUserId = "b", posts = twoAuthors())
        vm.markCurrentViewed()
        coVerify { storyRepository.markViewed("b1") }
    }

    @Test
    fun `a failed load stops loading without dismissing`() = runTest {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns
            NetworkResult.Failure(me.meeshy.sdk.net.ApiError(message = "boom"))
        val handle = SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "a"))
        val vm = StoryViewerViewModel(storyRepository, session, config, handle)

        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.isDismissed).isFalse()
        assertThat(vm.state.value.slides).isEmpty()
    }
}
