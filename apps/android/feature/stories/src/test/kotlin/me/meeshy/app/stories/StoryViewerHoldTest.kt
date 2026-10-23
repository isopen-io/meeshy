package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * L'appui long fige la story et le relâchement ne la relance pas ; le tap suivant la
 * reprend SANS naviguer (iOS `StoryGestureOverlayView`). Changer d'auteur la relance.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerHoldTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val now = Instant.parse("2026-10-23T12:00:00Z")
    private val repo: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { currentUserId } returns "me"
    }

    private fun story(id: String, author: String, hoursAgo: Long) = ApiPost(
        id = id,
        type = "STORY",
        content = id,
        createdAt = now.minusSeconds(hoursAgo * 3_600).toString(),
        author = ApiAuthor(id = author, username = "name-$author"),
    )

    private fun viewer(): StoryViewerViewModel {
        coEvery { repo.cachedStories() } returns listOf(
            story("a1", "a", 1),
            story("b1", "b", 4),
            story("b2", "b", 3),
        )
        return StoryViewerViewModel(
            repo,
            mockk(relaxed = true),
            session,
            mockk<SocialSocketManager>(relaxed = true),
            MeeshyConfig(),
            mockk(relaxed = true),
            object : CacheClock { override fun nowMillis(): Long = now.toEpochMilli() },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "b")),
        )
    }

    @Test
    fun `a long press freezes the story`() = runTest(dispatcher) {
        val vm = viewer()

        vm.pauseByHold()

        assertThat(vm.state.value.isPaused).isTrue()
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `a tap on a frozen story resumes it without navigating`() = runTest(dispatcher) {
        val vm = viewer()
        vm.pauseByHold()

        vm.onCanvasTap(onLeftHalf = false)

        assertThat(vm.state.value.isPaused).isFalse()
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `a tap on a playing story navigates by side`() = runTest(dispatcher) {
        val vm = viewer()

        vm.onCanvasTap(onLeftHalf = false)
        assertThat(vm.state.value.current?.id).isEqualTo("b2")

        vm.onCanvasTap(onLeftHalf = true)
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `the pause survives a re-projection of the slide`() = runTest(dispatcher) {
        val vm = viewer()
        vm.pauseByHold()

        vm.toggleLanguageOverride("en")

        assertThat(vm.state.value.isPaused).isTrue()
    }

    @Test
    fun `swiping to another author resumes playback`() = runTest(dispatcher) {
        val vm = viewer()
        vm.pauseByHold()

        vm.onSwipe(StorySwipeAction.PreviousGroup)

        assertThat(vm.state.value.isPaused).isFalse()
        assertThat(vm.state.value.authorName).isEqualTo("name-a")
    }
}
