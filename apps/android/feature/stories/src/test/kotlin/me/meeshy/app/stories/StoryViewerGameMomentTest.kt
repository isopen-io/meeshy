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
import me.meeshy.sdk.game.GameMomentPresence
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

/** Une célébration du jeu à l'écran fige la story dessous et la relance en partant (iOS `isGameMomentShown`, #9821). */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerGameMomentTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val now = Instant.parse("2026-10-23T12:00:00Z")
    private val repo: StoryRepository = mockk(relaxed = true)
    private val moment = GameMomentPresence()
    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
        every { currentUserId } returns "me"
    }

    private fun viewer(): StoryViewerViewModel {
        coEvery { repo.cachedStories() } returns listOf(
            ApiPost(
                id = "b1",
                type = "STORY",
                content = "b1",
                createdAt = now.minusSeconds(3_600).toString(),
                author = ApiAuthor(id = "b", username = "name-b"),
            ),
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
            moment,
        )
    }

    @Test
    fun `a celebration on screen freezes the story and its departure releases it`() = runTest(dispatcher) {
        val vm = viewer()
        assertThat(vm.state.value.isPaused).isFalse()

        moment.update(true)
        assertThat(vm.state.value.isPaused).isTrue()

        moment.update(false)
        assertThat(vm.state.value.isPaused).isFalse()
    }

    @Test
    fun `a story the viewer froze by hand stays frozen when the celebration leaves`() = runTest(dispatcher) {
        val vm = viewer()
        vm.pauseByHold()
        moment.update(true)

        moment.update(false)

        assertThat(vm.state.value.isPaused).isTrue()
    }
}
