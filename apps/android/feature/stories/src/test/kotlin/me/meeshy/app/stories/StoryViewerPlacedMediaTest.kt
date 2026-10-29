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
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.PrivacyPreferences
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
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

/** Ce que le lecteur Android fait d'un média de premier plan posé sur la scène — par iOS ou par le composeur Android (#13630). */
@OptIn(ExperimentalCoroutinesApi::class)
class StoryViewerPlacedMediaTest {

    private val dispatcher = UnconfinedTestDispatcher()

    @Before
    fun setUp() = Dispatchers.setMain(dispatcher)

    @After
    fun tearDown() = Dispatchers.resetMain()

    private val storyRepository: StoryRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true) {
        every { storyReacted } returns MutableSharedFlow(extraBufferCapacity = 1)
        every { storyUnreacted } returns MutableSharedFlow(extraBufferCapacity = 1)
        every { storyTranslationUpdated } returns MutableSharedFlow(extraBufferCapacity = 1)
        every { storyDeleted } returns MutableSharedFlow(extraBufferCapacity = 1)
        every { storyUpdated } returns MutableSharedFlow(extraBufferCapacity = 1)
    }

    private fun story(media: List<ApiPostMedia>, objects: List<StoryMediaObject>) = ApiPost(
        id = "s1",
        type = "STORY",
        content = "x",
        createdAt = Instant.now().minusSeconds(3_600).toString(),
        author = ApiAuthor(id = "a", username = "a"),
        isViewedByMe = false,
        media = media,
        storyEffects = StoryEffects(mediaObjects = objects),
    )

    private fun slideOf(post: ApiPost): StorySlideView {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { session.currentUserId } returns null
        coEvery { storyRepository.list(any(), any()) } returns NetworkResult.Success(listOf(post))
        val vm = StoryViewerViewModel(
            storyRepository, mockk<PostRepository>(relaxed = true), session, socialSocket, MeeshyConfig(),
            mockk(relaxed = true),
            object : CacheClock { override fun nowMillis(): Long = 0L },
            InMemoryPrivacyPreferencesStore(PrivacyPreferences()),
            SavedStateHandle(mapOf(StoryViewerViewModel.USER_ID_ARG to "a")),
        )
        return vm.state.value.current!!
    }

    private fun photo(id: String, width: Int? = null, height: Int? = null) =
        ApiPostMedia(id = id, fileUrl = "http://cdn/$id.jpg", mimeType = "image/jpeg", width = width, height = height)

    @Test
    fun `a placed media without its own address is read at the piece its postMediaId names`() = runTest {
        val slide = slideOf(
            story(
                media = listOf(photo("bg"), photo("p")),
                objects = listOf(
                    StoryMediaObject(id = "bgObj", postMediaId = "bg", isBackground = true),
                    StoryMediaObject(id = "cmid-1", postMediaId = "p", mediaURL = null, x = 0.3, y = 0.6),
                ),
            ),
        )

        assertThat(slide.foregroundMedia.map { it.url }).containsExactly("http://cdn/p.jpg")
    }

    @Test
    fun `a placed media naming a piece the story does not carry is not painted`() = runTest {
        val slide = slideOf(
            story(media = listOf(photo("p")), objects = listOf(StoryMediaObject(id = "o", postMediaId = "ghost", mediaURL = null))),
        )

        assertThat(slide.foregroundMedia).isEmpty()
    }

    @Test
    fun `a placed media keeps the rotation its author gave it`() = runTest {
        val slide = slideOf(
            story(media = listOf(photo("p")), objects = listOf(StoryMediaObject(id = "o", postMediaId = "p", rotation = -35.0))),
        )

        assertThat(slide.foregroundMedia.single().rotation).isWithin(1e-9).of(-35.0)
    }

    @Test
    fun `an unmeasured placed media takes the ratio of its piece and a measured one keeps its own`() = runTest {
        val slide = slideOf(
            story(
                media = listOf(photo("p", 1080, 1920), photo("q", 1000, 1000)),
                objects = listOf(
                    StoryMediaObject(id = "o1", postMediaId = "p"),
                    StoryMediaObject(id = "o2", postMediaId = "q", aspectRatio = 1.5),
                ),
            ),
        )

        assertThat(slide.foregroundMedia.map { it.aspectRatio }).containsExactly(0.5625, 1.5).inOrder()
    }

    @Test
    fun `a story made only of placed media has no background photo`() = runTest {
        val slide = slideOf(
            story(media = listOf(photo("p")), objects = listOf(StoryMediaObject(id = "o", postMediaId = "p", x = 0.3))),
        )

        assertThat(slide.imageUrl).isNull()
        assertThat(slide.foregroundMedia.map { it.url }).containsExactly("http://cdn/p.jpg")
    }

    @Test
    fun `a piece no object designates still serves as the static backdrop`() = runTest {
        val slide = slideOf(
            story(media = listOf(photo("p"), photo("backdrop")), objects = listOf(StoryMediaObject(id = "o", postMediaId = "p"))),
        )

        assertThat(slide.imageUrl).isEqualTo("http://cdn/backdrop.jpg")
    }
}
