package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
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
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryReactionDelivery
import me.meeshy.sdk.story.StoryReactionPublisher
import me.meeshy.sdk.story.StoryRepository
import me.meeshy.ui.component.FeedbackKind
import me.meeshy.ui.component.FeedbackToastRequest
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/** Réseau contre refus pour la barre de réactions du lecteur : la file garde le cœur allumé, un refus rembobine ce tap-là. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerReactionRecoveryTest {

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

    private fun story(id: String, hoursAgo: Long) = ApiPost(
        id = id,
        type = "STORY",
        content = "text-$id",
        createdAt = Instant.ofEpochMilli(now - hoursAgo * 3_600_000).toString(),
        author = ApiAuthor(id = "demo", username = "demo"),
        isViewedByMe = false,
        visibility = "PUBLIC",
    )

    private fun viewer(publisher: StoryReactionPublisher): StoryViewerViewModel {
        every { session.currentUser } returns MutableStateFlow(null)
        every { session.currentUserId } returns "me"
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(listOf(story("d1", 3), story("d2", 1)))
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
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "demo")),
            reactionPublisher = publisher,
        )
    }

    @Test
    fun `a reaction queued for the return of the network keeps the heart lit`() = runTest {
        val vm = viewer { _, _ -> StoryReactionDelivery.Queued }

        vm.react("🔥")

        assertThat(vm.state.value.reactionCount).isEqualTo(1)
        assertThat(vm.state.value.myReactions).containsExactly("🔥")
    }

    @Test
    fun `a limit reached refusal takes the tap back and says so`() = runTest {
        val vm = viewer { _, _ -> StoryReactionDelivery.Refused(409, limitReached = true) }

        vm.toasts.test {
            vm.react("🔥")
            assertThat(awaitItem()).isEqualTo(FeedbackToastRequest(R.string.story_reaction_limit_reached, FeedbackKind.Error))
        }
        assertThat(vm.state.value.reactionCount).isEqualTo(0)
        assertThat(vm.state.value.myReactions).isEmpty()
    }

    @Test
    fun `a refusal after the reader moved on restores its own story and touches no other`() = runTest {
        val gate = CompletableDeferred<StoryReactionDelivery>()
        val vm = viewer { storyId, _ -> if (storyId == "d1") gate.await() else StoryReactionDelivery.Delivered }
        val first = vm.state.value.currentStoryId
        assertThat(first).isEqualTo("d1")

        vm.react("🔥")
        vm.advance()
        vm.react("❤️")
        assertThat(vm.state.value.myReactions).containsExactly("❤️")

        vm.toasts.test {
            gate.complete(StoryReactionDelivery.Refused(404, limitReached = false))
            expectNoEvents()
        }
        assertThat(vm.state.value.currentStoryId).isEqualTo("d2")
        assertThat(vm.state.value.reactionCount).isEqualTo(1)
        assertThat(vm.state.value.myReactions).containsExactly("❤️")
        vm.back()
        assertThat(vm.state.value.reactionCount).isEqualTo(0)
        assertThat(vm.state.value.myReactions).isEmpty()
    }
}
