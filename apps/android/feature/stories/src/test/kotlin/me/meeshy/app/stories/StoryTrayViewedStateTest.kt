package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.InMemoryStoryViewedLedger
import me.meeshy.sdk.story.StoryPublishQueue
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test

/** Le registre des vues est réinjecté à chaque reconstruction du plateau : l'anneau gris ne repasse jamais en épais. */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryTrayViewedStateTest {

    private val dispatcher = StandardTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private fun story(id: String, authorId: String, viewed: Boolean = false, editedAt: String? = null) = ApiPost(
        id = id,
        type = "STORY",
        createdAt = java.time.Instant.now().toString(),
        author = ApiAuthor(id = authorId, username = authorId),
        isViewedByMe = viewed,
        contentEditedAt = editedAt,
    )

    private fun viewModel(posts: List<ApiPost>, ledger: InMemoryStoryViewedLedger): StoriesViewModel {
        val repo = mockk<StoryRepository>(relaxed = true).also {
            every { it.storiesStream(any(), any()) } returns flowOf(CacheResult.Fresh(posts, ageMillis = 0))
            every { it.publishQueue() } returns flowOf(StoryPublishQueue(emptyList(), emptyList()))
        }
        val session = mockk<SessionRepository>(relaxed = true).also {
            every { it.currentUser } returns MutableStateFlow(MeeshyUser(id = "me", username = "me"))
            every { it.currentUserId } returns "me"
        }
        val social = mockk<SocialSocketManager>(relaxed = true).also {
            every { it.storyDeleted } returns kotlinx.coroutines.flow.MutableSharedFlow()
            every { it.storyUpdated } returns kotlinx.coroutines.flow.MutableSharedFlow()
            every { it.storyCreated } returns kotlinx.coroutines.flow.MutableSharedFlow()
            every { it.postReposted } returns kotlinx.coroutines.flow.MutableSharedFlow()
        }
        return StoriesViewModel(
            repo, session, MeeshyConfig(), mockk(relaxed = true), social, mockk(relaxed = true),
            viewedLedger = ledger,
        )
    }

    @Test
    fun `une story vue localement reste grisee quand le cache la dit non vue`() = runTest(dispatcher) {
        val ledger = InMemoryStoryViewedLedger(mapOf("s1" to Long.MAX_VALUE))
        val vm = viewModel(listOf(story("s1", "u1")), ledger)
        advanceUntilIdle()

        val ring = vm.state.value.tray.others.single()
        assertThat(ring.hasUnviewed).isFalse()
        assertThat(ring.unviewedCount).isEqualTo(0)
    }

    @Test
    fun `une vue inscrite apres coup grise l'anneau sans attendre le reseau`() = runTest(dispatcher) {
        val ledger = InMemoryStoryViewedLedger()
        val vm = viewModel(listOf(story("s1", "u1")), ledger)
        advanceUntilIdle()
        assertThat(vm.state.value.tray.others.single().hasUnviewed).isTrue()

        ledger.record("s1", Long.MAX_VALUE)
        advanceUntilIdle()

        assertThat(vm.state.value.tray.others.single().hasUnviewed).isFalse()
    }

    @Test
    fun `une edition posterieure a la vue rallume l'anneau`() = runTest(dispatcher) {
        val ledger = InMemoryStoryViewedLedger(mapOf("s1" to 1_000L))
        val vm = viewModel(listOf(story("s1", "u1", editedAt = "2026-10-22T09:00:00Z")), ledger)
        advanceUntilIdle()

        assertThat(vm.state.value.tray.others.single().hasUnviewed).isTrue()
    }

    @Test
    fun `mes propres stories sont couvertes par le registre meme editees`() = runTest(dispatcher) {
        val ledger = InMemoryStoryViewedLedger(mapOf("m1" to 1_000L))
        val vm = viewModel(listOf(story("m1", "me", editedAt = "2026-10-22T09:00:00Z")), ledger)
        advanceUntilIdle()

        assertThat(vm.state.value.tray.self?.hasUnviewed).isFalse()
    }
}
