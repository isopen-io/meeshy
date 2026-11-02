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
 * L’en-tête du lecteur montre l’avatar et l’heure de publication, et une seule commande coupe le son.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerChromeTest {

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
    fun `the header carries the author's resolved avatar`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(
            story("b1", "b", 2).copy(author = ApiAuthor(id = "b", username = "name-b", avatar = "/u/b.jpg")),
        )
        val vm = StoryViewerViewModel(
            repo, mockk(relaxed = true), session, mockk<SocialSocketManager>(relaxed = true), MeeshyConfig(),
            mockk(relaxed = true), object : CacheClock { override fun nowMillis(): Long = now.toEpochMilli() },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "b")),
        )

        assertThat(vm.state.value.authorAvatarUrl).endsWith("/u/b.jpg")
    }

    @Test
    fun `each slide carries its publication instant for the elapsed time`() = runTest(dispatcher) {
        val vm = viewer()

        assertThat(vm.state.value.current?.createdAtMillis).isEqualTo(now.minusSeconds(4 * 3_600).toEpochMilli())
    }

    @Test
    fun `muting holds across slides until toggled back`() = runTest(dispatcher) {
        val vm = viewer()

        vm.toggleMute()
        vm.advance()
        assertThat(vm.state.value.isMuted).isTrue()

        vm.toggleMute()
        assertThat(vm.state.value.isMuted).isFalse()
    }
}
