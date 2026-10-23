package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
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
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * Le lecteur s'ouvre sur l'auteur dont on a touché l'anneau, depuis ce que la barre a
 * déjà en main (iOS `StoryViewerContainer.ensureGroupAvailable`) : hors ligne il s'ouvre
 * quand même, il ne se referme jamais seul, et il n'ouvre JAMAIS la story d'un autre.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerLaunchTest {

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

    private fun story(id: String, author: String, hoursAgo: Long, viewed: Boolean = false) = ApiPost(
        id = id,
        type = "STORY",
        content = id,
        createdAt = now.minusSeconds(hoursAgo * 3_600).toString(),
        author = ApiAuthor(id = author, username = "name-$author"),
        isViewedByMe = viewed,
    )

    private fun viewer(author: String): StoryViewerViewModel = StoryViewerViewModel(
        repo,
        mockk(relaxed = true),
        session,
        mockk<SocialSocketManager>(relaxed = true),
        MeeshyConfig(),
        mockk(relaxed = true),
        object : CacheClock { override fun nowMillis(): Long = now.toEpochMilli() },
        InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
        SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to author)),
    )

    private val offline = NetworkResult.Failure(ApiError(message = "hors ligne"))

    @Test
    fun `the stories already in the tray open the viewer without the network`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("b1", "b", 2))

        val vm = viewer("b")

        assertThat(vm.state.value.current?.id).isEqualTo("b1")
        coVerify(exactly = 0) { repo.list(any(), any()) }
    }

    @Test
    fun `offline with the author in the tray the viewer still opens`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("b1", "b", 2))
        coEvery { repo.list(any(), any()) } returns offline

        val vm = viewer("b")

        assertThat(vm.state.value.isDismissed).isFalse()
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `an author missing from the tray is fetched from the network`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("a1", "a", 1))
        coEvery { repo.list(any(), any()) } returns NetworkResult.Success(listOf(story("a1", "a", 1), story("b1", "b", 2)))

        val vm = viewer("b")

        assertThat(vm.state.value.authorName).isEqualTo("name-b")
    }

    @Test
    fun `an author found nowhere shows the fallback and never another author`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("a1", "a", 1))
        coEvery { repo.list(any(), any()) } returns NetworkResult.Success(listOf(story("a1", "a", 1)))

        val vm = viewer("b")

        assertThat(vm.state.value.loadFailed).isTrue()
        assertThat(vm.state.value.isDismissed).isFalse()
        assertThat(vm.state.value.isLoading).isFalse()
        assertThat(vm.state.value.slides).isEmpty()
    }

    @Test
    fun `retry after a failure opens the author once the network has it`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns emptyList()
        coEvery { repo.list(any(), any()) } returns offline
        val vm = viewer("b")
        coEvery { repo.list(any(), any()) } returns NetworkResult.Success(listOf(story("b1", "b", 2)))

        vm.retry()

        assertThat(vm.state.value.loadFailed).isFalse()
        assertThat(vm.state.value.current?.id).isEqualTo("b1")
    }

    @Test
    fun `the viewer opens on the first story not yet seen`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(
            story("b1", "b", 5, viewed = true),
            story("b2", "b", 4, viewed = true),
            story("b3", "b", 3),
        )

        val vm = viewer("b")

        assertThat(vm.state.value.current?.id).isEqualTo("b3")
        assertThat(vm.state.value.index).isEqualTo(2)
    }

    @Test
    fun `an expired story of another author is not replayed`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("b0", "b", 30), story("b1", "b", 2))

        val vm = viewer("b")

        assertThat(vm.state.value.slides.map { it.id }).containsExactly("b1")
    }

    @Test
    fun `the author keeps their own expired stories`() = runTest(dispatcher) {
        coEvery { repo.cachedStories() } returns listOf(story("m0", "me", 30), story("m1", "me", 2))

        val vm = viewer("me")

        assertThat(vm.state.value.slides.map { it.id }).containsExactly("m0", "m1").inOrder()
    }
}
