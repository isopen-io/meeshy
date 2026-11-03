package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
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
import me.meeshy.feature.stories.R
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.story.StoryRepostDestination
import me.meeshy.sdk.model.story.StoryRepostFailure
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryDirectRepostOutcome
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.sdk.story.StoryRepostPublisher
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** « Republier » vers la story, le post ou le réel (#15067) : une destination, un toast, et la marque du rail pour la story seule. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerRepostDestinationTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val session: SessionRepository = mockk(relaxed = true)
    private val storyRepository: StoryRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns MutableSharedFlow()
        every { storyUnreacted } returns MutableSharedFlow()
        every { storyTranslationUpdated } returns MutableSharedFlow()
        every { storyDeleted } returns MutableSharedFlow()
        every { storyUpdated } returns MutableSharedFlow()
    }

    private class Recorder(var outcome: StoryDirectRepostOutcome) : StoryRepostPublisher {
        val sent = mutableListOf<Pair<String, StoryRepostDestination>>()
        override suspend fun publish(storyId: String, destination: StoryRepostDestination): StoryDirectRepostOutcome {
            sent += storyId to destination
            return outcome
        }
    }

    private fun viewer(publisher: StoryRepostPublisher): StoryViewerViewModel {
        val story = ApiPost(
            id = "d1",
            type = "STORY",
            content = "text",
            createdAt = Instant.parse("2026-06-17T11:00:00Z").toString(),
            author = ApiAuthor(id = "demo", username = "demo"),
            isViewedByMe = false,
            visibility = "PUBLIC",
        )
        every { session.currentUser } returns MutableStateFlow(null)
        every { session.currentUserId } returns "me"
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(listOf(story))
        coEvery { storyRepository.markViewed(any()) } returns NetworkResult.Success(Unit)
        return StoryViewerViewModel(
            storyRepository,
            mockk<PostRepository>(relaxed = true),
            session,
            socialSocket,
            MeeshyConfig(),
            mockk(relaxed = true),
            object : CacheClock { override fun nowMillis(): Long = Instant.parse("2026-06-17T12:00:00Z").toEpochMilli() },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "demo")),
            repostPublisher = publisher,
        )
    }

    @Test
    fun `each destination says its own success, the post and the reel never touch the rail's mark`() = runTest {
        val cases = mapOf(
            StoryRepostDestination.STORY to R.string.my_stories_repost_success,
            StoryRepostDestination.POST to R.string.story_repost_success,
            StoryRepostDestination.REEL to R.string.story_repost_success_reel,
        )
        cases.forEach { (destination, message) ->
            val recorder = Recorder(StoryDirectRepostOutcome.Published)
            val vm = viewer(recorder)
            vm.toasts.test {
                vm.repostCurrentStory(destination)
                assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(message, FeedbackKind.Success))
            }
            assertThat(recorder.sent).containsExactly("d1" to destination)
            assertThat(vm.state.value.hasReposted).isEqualTo(destination == StoryRepostDestination.STORY)
        }
    }

    @Test
    fun `offline, the republication waits in the queue and the reader says it is done`() = runTest {
        val vm = viewer(Recorder(StoryDirectRepostOutcome.Queued))

        vm.toasts.test {
            vm.repostCurrentStory(StoryRepostDestination.STORY)
            assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(R.string.my_stories_repost_success, FeedbackKind.Success))
        }
        assertThat(vm.state.value.hasReposted).isTrue()
    }

    @Test
    fun `a swallowed duplicate says nothing and gives the mark back`() = runTest {
        val vm = viewer(Recorder(StoryDirectRepostOutcome.Duplicate))

        vm.repostCurrentStory(StoryRepostDestination.STORY)

        assertThat(vm.state.value.hasReposted).isFalse()
    }

    @Test
    fun `a refusal names its reason whatever the destination`() = runTest {
        val cases = mapOf(
            StoryRepostFailure.SOURCE_GONE to R.string.story_repost_error_unavailable,
            StoryRepostFailure.AUDIENCE_WIDENING to R.string.story_repost_error_forbidden,
            StoryRepostFailure.OTHER to R.string.story_repost_error_generic,
        )
        cases.forEach { (failure, message) ->
            val vm = viewer(Recorder(StoryDirectRepostOutcome.Refused(failure)))
            vm.toasts.test {
                vm.repostCurrentStory(StoryRepostDestination.REEL)
                assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(message, FeedbackKind.Error))
            }
        }
    }
}
