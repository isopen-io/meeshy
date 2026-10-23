package me.meeshy.app.stories

import androidx.lifecycle.SavedStateHandle
import androidx.work.WorkManager
import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheClock
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.SocketStoryDeletedData
import me.meeshy.sdk.model.SocketStoryReactedData
import me.meeshy.sdk.model.SocketStoryTranslationUpdatedData
import me.meeshy.sdk.model.SocketStoryUnreactedData
import me.meeshy.sdk.model.SocketStoryUpdatedData
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.privacy.InMemoryPrivacyPreferencesStore
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import me.meeshy.sdk.story.StoryPublishQueue
import me.meeshy.sdk.story.StoryRepository
import org.junit.After
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * Un événement temps réel qui fait échouer sa projection ne fait JAMAIS planter l'app.
 * Les écouteurs `story:*` du lecteur et de la barre rejouent toute la projection d'une
 * story ; une exception y sortait de `viewModelScope` vers le gestionnaire non intercepté
 * du thread principal — l'app se fermait pendant qu'une story était à l'écran
 * (CLAUDE.md § Async EventEmitter Hazard). L'écouteur doit aussi SURVIVRE : l'événement
 * suivant est encore appliqué.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryRealtimeResilienceTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private var projectionFails = false
    private val userFlow = MutableStateFlow<MeeshyUser?>(MeeshyUser(id = "me", username = "me"))
    private val session: SessionRepository = mockk(relaxed = true) {
        every { currentUser } answers {
            if (projectionFails) throw IllegalStateException("projection impossible")
            userFlow
        }
        every { currentUserId } returns "me"
    }

    private val reacted = MutableSharedFlow<SocketStoryReactedData>(extraBufferCapacity = 8)
    private val unreacted = MutableSharedFlow<SocketStoryUnreactedData>(extraBufferCapacity = 8)
    private val translated = MutableSharedFlow<SocketStoryTranslationUpdatedData>(extraBufferCapacity = 8)
    private val deleted = MutableSharedFlow<SocketStoryDeletedData>(extraBufferCapacity = 8)
    private val updated = MutableSharedFlow<SocketStoryUpdatedData>(extraBufferCapacity = 8)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns reacted
        every { storyUnreacted } returns unreacted
        every { storyTranslationUpdated } returns translated
        every { storyDeleted } returns deleted
        every { storyUpdated } returns updated
    }

    private val created = Instant.now().minusSeconds(3_600).toString()

    private fun story(id: String, content: String = "texte-$id") = ApiPost(
        id = id,
        type = "STORY",
        content = content,
        createdAt = created,
        author = ApiAuthor(id = "a", username = "alice"),
        isViewedByMe = false,
        storyEffects = StoryEffects(textObjects = listOf(StoryTextObject(id = "t1", text = "Salut"))),
    )

    private fun viewer(posts: List<ApiPost>): StoryViewerViewModel {
        val repo: StoryRepository = mockk(relaxed = true)
        coEvery { repo.list(any(), any()) } returns NetworkResult.Success(posts)
        coEvery { repo.markViewed(any()) } returns NetworkResult.Success(Unit)
        return StoryViewerViewModel(
            repo,
            mockk<PostRepository>(relaxed = true),
            session,
            socialSocket,
            MeeshyConfig(),
            mockk(relaxed = true),
            object : CacheClock { override fun nowMillis(): Long = 0L },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "a")),
        )
    }

    @Test
    fun `a story update whose projection fails leaves the viewer open and listening`() = runTest(dispatcher) {
        val vm = viewer(listOf(story("s1"), story("s2")))

        projectionFails = true
        updated.emit(SocketStoryUpdatedData(story = story("s1", content = "casse")))
        projectionFails = false
        updated.emit(SocketStoryUpdatedData(story = story("s1", content = "édité")))

        assertThat(vm.state.value.isDismissed).isFalse()
        assertThat(vm.state.value.current?.text).isEqualTo("édité")
    }

    @Test
    fun `a translation update whose projection fails leaves the viewer listening`() = runTest(dispatcher) {
        val vm = viewer(listOf(story("s1"), story("s2")))

        projectionFails = true
        translated.emit(SocketStoryTranslationUpdatedData(postId = "s1", textObjectIndex = 0, translations = mapOf("en" to "Hi")))
        projectionFails = false
        deleted.emit(SocketStoryDeletedData(storyId = "s1"))

        assertThat(vm.state.value.slides.map { it.id }).containsExactly("s2")
    }

    @Test
    fun `a deletion whose projection fails leaves the viewer listening`() = runTest(dispatcher) {
        val vm = viewer(listOf(story("s1"), story("s2"), story("s3")))

        projectionFails = true
        deleted.emit(SocketStoryDeletedData(storyId = "s3"))
        projectionFails = false
        deleted.emit(SocketStoryDeletedData(storyId = "s2"))

        assertThat(vm.state.value.slides.map { it.id }).containsExactly("s1")
    }

    @Test
    fun `a reaction whose projection fails leaves the viewer counting`() = runTest(dispatcher) {
        val vm = viewer(listOf(story("s1")))

        projectionFails = true
        reacted.emit(SocketStoryReactedData(storyId = "s1", userId = "other", emoji = "🔥"))
        projectionFails = false
        reacted.emit(SocketStoryReactedData(storyId = "s1", userId = "other2", emoji = "🔥"))

        assertThat(vm.state.value.reactionCount).isEqualTo(2)
    }

    private fun tray(
        repo: StoryRepository,
    ) = StoriesViewModel(repo, session, MeeshyConfig(), mockk<WorkManager>(relaxed = true), socialSocket)

    private fun trayRepo(stream: kotlinx.coroutines.flow.Flow<CacheResult<List<ApiPost>>>): StoryRepository =
        mockk<StoryRepository>(relaxed = true).also {
            every { it.storiesStream(any(), any()) } returns stream
            every { it.publishQueue() } returns flowOf(StoryPublishQueue(pending = emptyList(), failed = emptyList()))
        }

    @Test
    fun `a tray update that fails to merge leaves the tray listening`() = runTest(dispatcher) {
        val repo = trayRepo(flowOf(CacheResult.Fresh(listOf(story("s1")), ageMillis = 0)))
        coEvery { repo.applyStoryUpdate(any(), any(), any()) } throws IllegalStateException("cache illisible")
        coEvery { repo.removeCachedStory(any()) } throws IllegalStateException("cache illisible")
        tray(repo)

        updated.emit(SocketStoryUpdatedData(story = story("s1")))
        deleted.emit(SocketStoryDeletedData(storyId = "s1"))
        updated.emit(SocketStoryUpdatedData(story = story("s1")))

        coVerify(exactly = 2) { repo.applyStoryUpdate(any(), any(), any()) }
    }

    @Test
    fun `a stories stream that fails leaves the tray on screen without a skeleton`() = runTest(dispatcher) {
        val failing = flow<CacheResult<List<ApiPost>>> {
            emit(CacheResult.Fresh(listOf(story("s1")), ageMillis = 0))
            throw IllegalStateException("ligne de cache illisible")
        }
        val vm = tray(trayRepo(failing))

        assertThat(vm.state.value.showSkeleton).isFalse()
        assertThat(vm.state.value.tray.isEmpty).isFalse()
    }

    @Test
    fun `a tray emission whose projection fails does not stop the next one`() = runTest(dispatcher) {
        val stream = MutableSharedFlow<CacheResult<List<ApiPost>>>(extraBufferCapacity = 4)
        val vm = tray(trayRepo(stream))

        projectionFails = true
        stream.emit(CacheResult.Fresh(listOf(story("s1")), ageMillis = 0))
        projectionFails = false
        stream.emit(CacheResult.Fresh(listOf(story("s1")), ageMillis = 0))

        assertThat(vm.state.value.tray.isEmpty).isFalse()
    }
}
