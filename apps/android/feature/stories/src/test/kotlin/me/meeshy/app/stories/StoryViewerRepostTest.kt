package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.feature.stories.R
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** « Republier » dans le lecteur de stories (#14443) : un geste publie la republication, comme le rail iOS. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerRepostTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val storyRepository: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns MutableSharedFlow()
        every { storyUnreacted } returns MutableSharedFlow()
        every { storyTranslationUpdated } returns MutableSharedFlow()
        every { storyDeleted } returns MutableSharedFlow()
        every { storyUpdated } returns MutableSharedFlow()
    }

    private val now = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli()

    private fun story(id: String, authorId: String, repostCount: Int? = null) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = Instant.ofEpochMilli(now - 3_600_000).toString(),
        author = ApiAuthor(id = authorId, username = "name-$authorId"),
        isViewedByMe = false,
        visibility = "PUBLIC",
        repostCount = repostCount,
    )

    private fun viewer(posts: List<ApiPost>, me: String = "me"): StoryViewerViewModel {
        every { session.currentUser } returns MutableStateFlow(null)
        every { session.currentUserId } returns me
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(posts)
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        return StoryViewerViewModel(
            storyRepository,
            mockk<PostRepository>(relaxed = true),
            session,
            socialSocket,
            MeeshyConfig(),
            mockk(relaxed = true),
            object : CacheClock { override fun nowMillis(): Long = 0L },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to posts.first().author!!.id)),
        )
    }

    private fun refused(status: Int, code: String? = null) =
        NetworkResult.Failure(ApiError(message = "refused", code = code, httpStatus = status))

    @Test
    fun `Republier publishes the story on screen, once, through the repository`() = runTest {
        coEvery { storyRepository.repost(any()) } returns NetworkResult.Success(Unit)
        val vm = viewer(listOf(story("d1", authorId = "demo")))

        vm.repostCurrentStory()

        coVerify(exactly = 1) { storyRepository.repost("d1") }
    }

    @Test
    fun `the count and the mark move before the network answers`() = runTest {
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { storyRepository.repost(any()) } coAnswers { gate.await() }
        val vm = viewer(listOf(story("d1", authorId = "demo", repostCount = 2)))

        vm.repostCurrentStory()

        assertThat(vm.state.value.repostCount).isEqualTo(3)
        assertThat(vm.state.value.hasReposted).isTrue()
        gate.complete(NetworkResult.Success(Unit))
        assertThat(vm.state.value.repostCount).isEqualTo(3)
        assertThat(vm.state.value.hasReposted).isTrue()
    }

    @Test
    fun `a confirmed republication says so`() = runTest {
        coEvery { storyRepository.repost(any()) } returns NetworkResult.Success(Unit)
        val vm = viewer(listOf(story("d1", authorId = "demo")))

        vm.toasts.test {
            vm.repostCurrentStory()
            assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(R.string.my_stories_repost_success, FeedbackKind.Success))
        }
    }

    @Test
    fun `a refused republication rolls the count and the mark back`() = runTest {
        coEvery { storyRepository.repost(any()) } returns refused(500)
        val vm = viewer(listOf(story("d1", authorId = "demo", repostCount = 2)))

        vm.repostCurrentStory()

        assertThat(vm.state.value.repostCount).isEqualTo(2)
        assertThat(vm.state.value.hasReposted).isFalse()
    }

    @Test
    fun `a refusal names its reason, the way iOS does`() = runTest {
        val cases = listOf(
            refused(404) to R.string.story_repost_error_unavailable,
            refused(403, code = "REPOST_AUDIENCE_WIDENING") to R.string.story_repost_error_forbidden,
            refused(500) to R.string.story_repost_error_generic,
            NetworkResult.Failure(ApiError(message = "offline")) to R.string.story_repost_error_generic,
        )
        cases.forEach { (failure, message) ->
            coEvery { storyRepository.repost(any()) } returns failure
            val vm = viewer(listOf(story("d1", authorId = "demo")))
            vm.toasts.test {
                vm.repostCurrentStory()
                assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(message, FeedbackKind.Error))
            }
        }
    }

    @Test
    fun `a thrown call rolls back and says it failed`() = runTest {
        coEvery { storyRepository.repost(any()) } throws IllegalStateException("boom")
        val vm = viewer(listOf(story("d1", authorId = "demo", repostCount = 1)))

        vm.toasts.test {
            vm.repostCurrentStory()
            assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(R.string.story_repost_error_generic, FeedbackKind.Error))
        }
        assertThat(vm.state.value.repostCount).isEqualTo(1)
        assertThat(vm.state.value.hasReposted).isFalse()
    }

    @Test
    fun `a second tap while the first is in flight sends nothing more`() = runTest {
        val gate = CompletableDeferred<NetworkResult<Unit>>()
        coEvery { storyRepository.repost(any()) } coAnswers { gate.await() }
        val vm = viewer(listOf(story("d1", authorId = "demo", repostCount = 0)))

        vm.repostCurrentStory()
        vm.repostCurrentStory()

        assertThat(vm.state.value.repostCount).isEqualTo(1)
        coVerify(exactly = 1) { storyRepository.repost("d1") }
        gate.complete(NetworkResult.Success(Unit))
    }

    @Test
    fun `one's own story is never republished from the reader`() = runTest {
        val vm = viewer(listOf(story("mine1", authorId = "me")), me = "me")

        vm.repostCurrentStory()

        coVerify(exactly = 0) { storyRepository.repost(any()) }
        assertThat(vm.state.value.hasReposted).isFalse()
    }
}
