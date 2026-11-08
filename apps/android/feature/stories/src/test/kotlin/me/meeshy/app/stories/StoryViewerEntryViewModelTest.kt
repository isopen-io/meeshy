package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.StoryViewerInitialAction
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerEntryViewModelTest {

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()
    private fun isoAgo(hours: Long) = Instant.ofEpochMilli(now - hours * 3_600_000).toString()

    private fun post(id: String, authorId: String, hoursAgo: Long, content: String? = "text-$id") = ApiPost(
        id = id,
        type = "STORY",
        content = content,
        createdAt = isoAgo(hoursAgo),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
    )

    private class Fixture(
        val storyRepository: StoryRepository = mockk(relaxed = true),
        val postRepository: PostRepository = mockk(relaxed = true),
    )

    private fun viewModel(
        args: Map<String, String>,
        cached: List<ApiPost> = emptyList(),
        network: List<ApiPost> = emptyList(),
        single: ApiPost? = null,
        fixture: Fixture = Fixture(),
    ): StoryViewerViewModel {
        val session: SessionRepository = mockk(relaxed = true)
        every { session.currentUser } returns MutableStateFlow(null)
        every { session.currentUserId } returns null
        val socket: SocialSocketManager = mockk(relaxed = true) {
            every { storyReacted } returns MutableSharedFlow()
            every { storyUnreacted } returns MutableSharedFlow()
            every { storyTranslationUpdated } returns MutableSharedFlow()
            every { storyDeleted } returns MutableSharedFlow()
            every { storyUpdated } returns MutableSharedFlow()
        }
        coEvery { fixture.storyRepository.cachedStories() } returns cached
        coEvery { fixture.storyRepository.list(any(), any()) } returns NetworkResult.Success(network)
        coEvery { fixture.storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        single?.let { coEvery { fixture.postRepository.getPost(it.id) } returns NetworkResult.Success(it) }
        val clock = object : CacheClock { override fun nowMillis(): Long = now }
        return StoryViewerViewModel(
            fixture.storyRepository, fixture.postRepository, session, socket, MeeshyConfig(), mockk(relaxed = true), clock,
            InMemoryPrivacyPreferencesStore(PrivacyPreferences(allowAnalytics = false)), SavedStateHandle(args),
        )
    }

    private val authorB = listOf(post("b1", "b", 3), post("b2", "b", 2), post("b3", "b", 1))

    @Test
    fun `a named story opens on its own index not on the first unviewed`() = runTest {
        val vm = viewModel(
            mapOf(StoryViewerViewModel.USER_ID_ARG to "b", StoryViewerViewModel.STORY_ID_ARG to "b2"),
            cached = authorB,
        )
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.index).isEqualTo(1)
    }

    @Test
    fun `a story opened by id alone finds its author in the cache and stays on that group`() = runTest {
        val vm = viewModel(
            mapOf(StoryViewerViewModel.STORY_ID_ARG to "b2"),
            cached = listOf(post("a1", "a", 1)) + authorB,
        )
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        assertThat(vm.state.value.groupCount).isEqualTo(1)
    }

    @Test
    fun `a board that ignores the group is completed by a unit fetch of the named story`() = runTest {
        val lone = post("z1", "z", 1)
        val vm = viewModel(mapOf(StoryViewerViewModel.STORY_ID_ARG to "z1"), network = authorB, single = lone)
        assertThat(vm.state.value.current?.id).isEqualTo("z1")
        assertThat(vm.state.value.loadFailed).isFalse()
    }

    @Test
    fun `a story nobody can serve reports it as missing instead of an error`() = runTest {
        val vm = viewModel(mapOf(StoryViewerViewModel.STORY_ID_ARG to "ghost"), network = authorB)
        assertThat(vm.state.value.missingStoryId).isEqualTo("ghost")
    }

    @Test
    fun `an empty slide is skipped and playback closes only when everything is exhausted`() = runTest {
        val vm = viewModel(
            mapOf(StoryViewerViewModel.USER_ID_ARG to "b"),
            cached = listOf(post("b1", "b", 3, content = null), post("b2", "b", 2)),
        )
        assertThat(vm.state.value.current?.id).isEqualTo("b2")
        vm.advance()
        assertThat(vm.state.value.isDismissed).isTrue()
    }

    @Test
    fun `the notification intent is consumed once when a story is on screen`() = runTest {
        val vm = viewModel(
            mapOf(
                StoryViewerViewModel.STORY_ID_ARG to "b2",
                StoryViewerViewModel.ACTION_ARG to "comments",
                StoryViewerViewModel.COMMENT_ID_ARG to "k1",
            ),
            cached = authorB,
        )
        val entry = vm.consumeEntryIntent()
        assertThat(entry?.action).isEqualTo(StoryViewerInitialAction.COMMENTS)
        assertThat(entry?.targetCommentId).isEqualTo("k1")
        assertThat(vm.consumeEntryIntent()).isNull()
    }
}
