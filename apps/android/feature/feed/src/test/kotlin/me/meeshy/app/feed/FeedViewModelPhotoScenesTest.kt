package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.slot
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import me.meeshy.sdk.cache.CacheResult
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.MosaicLayoutMode
import me.meeshy.sdk.model.SocketCommentAddedData
import me.meeshy.sdk.model.SocketCommentDeletedData
import me.meeshy.sdk.model.SocketMediaCaptionTranslationUpdatedData
import me.meeshy.sdk.model.SocketPostBookmarkedData
import me.meeshy.sdk.model.SocketPostCreatedData
import me.meeshy.sdk.model.SocketPostDeletedData
import me.meeshy.sdk.model.SocketPostLikedData
import me.meeshy.sdk.model.SocketPostRepostedData
import me.meeshy.sdk.model.SocketPostTranslationUpdatedData
import me.meeshy.sdk.model.SocketPostUnlikedData
import me.meeshy.sdk.model.SocketPostUpdatedData
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.net.api.CreatePostRequest
import me.meeshy.sdk.post.InMemoryPostComposerDraftStore
import me.meeshy.sdk.post.PostRepository
import me.meeshy.sdk.publication.PublicationOutbox
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.SocialSocketManager
import org.junit.After
import org.junit.Before
import org.junit.Test

/** #13612 — what `publishPost` queues for a post of photos: their scenes, and the layout only where it was offered. */
@OptIn(ExperimentalCoroutinesApi::class)
class FeedViewModelPhotoScenesTest {
    @Before fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After fun tearDown() = Dispatchers.resetMain()

    private val publications: PublicationOutbox = mockk(relaxed = true)
    private val repository: PostRepository = mockk(relaxed = true)
    private val session: SessionRepository = mockk(relaxed = true)
    private val socialSocket: SocialSocketManager = mockk(relaxed = true)

    private fun viewModel(): FeedViewModel {
        every { session.currentUser } returns MutableStateFlow<MeeshyUser?>(null)
        every { repository.feedHasMore } returns MutableStateFlow(true)
        every { repository.feedStream(any(), any()) } returns flowOf(CacheResult.Empty)
        every { socialSocket.postCreated } returns MutableSharedFlow<SocketPostCreatedData>()
        every { socialSocket.postDeleted } returns MutableSharedFlow<SocketPostDeletedData>()
        every { socialSocket.postLiked } returns MutableSharedFlow<SocketPostLikedData>()
        every { socialSocket.postUnliked } returns MutableSharedFlow<SocketPostUnlikedData>()
        every { socialSocket.postBookmarked } returns MutableSharedFlow<SocketPostBookmarkedData>()
        every { socialSocket.commentAdded } returns MutableSharedFlow<SocketCommentAddedData>()
        every { socialSocket.commentDeleted } returns MutableSharedFlow<SocketCommentDeletedData>()
        every { socialSocket.postTranslationUpdated } returns MutableSharedFlow<SocketPostTranslationUpdatedData>()
        every { socialSocket.mediaCaptionTranslationUpdated } returns MutableSharedFlow<SocketMediaCaptionTranslationUpdatedData>()
        every { socialSocket.postUpdated } returns MutableSharedFlow<SocketPostUpdatedData>()
        every { socialSocket.postReposted } returns MutableSharedFlow<SocketPostRepostedData>()
        return FeedViewModel(
            repository, session, socialSocket, MeeshyConfig(), mockk(relaxed = true), mockk(relaxed = true), mockk(relaxed = true),
            mockk(relaxed = true), publications, InMemoryPostComposerDraftStore(), mockk<MediaUploadQueue>(relaxed = true),
        )
    }

    private fun photo(id: String) = UploadedMedia(id, "https://cdn.meeshy.me/p/$id.jpg", "image/jpeg", 1L, 800, 600, null, null)

    private fun queued(block: FeedViewModel.() -> Unit): CreatePostRequest {
        val captured = slot<CreatePostRequest>()
        viewModel().block()
        coVerify(exactly = 1) { publications.enqueuePost(capture(captured), any()) }
        return captured.captured
    }

    @Test
    fun `a post of three photos is queued with a scene per photo and the layout the author armed`() = runTest {
        val request = queued {
            publishPost(
                content = "trois vues", visibility = "PUBLIC", mediaIds = listOf("a", "b", "c"),
                language = "fr", media = listOf(photo("a"), photo("b"), photo("c")), layout = MosaicLayoutMode.HERO,
            )
        }

        val canvas = request.storyEffects!!.canvas!!
        assertThat(canvas.scenes).hasSize(3)
        assertThat(canvas.layout).isEqualTo(MosaicLayoutMode.HERO)
        assertThat(request.mediaIds).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `without a choice the document carries no layout, the readers fall back on the carousel`() = runTest {
        val request = queued {
            publishPost(content = "", visibility = "PUBLIC", mediaIds = listOf("a", "b"), media = listOf(photo("a"), photo("b")))
        }

        assertThat(request.storyEffects!!.canvas!!.layout).isNull()
    }

    @Test
    fun `a layout armed before the photos were removed never travels with a lone photo, which leaves as a one scene document`() = runTest {
        val request = queued {
            publishPost(content = "", visibility = "PUBLIC", mediaIds = listOf("a"), media = listOf(photo("a")), layout = MosaicLayoutMode.WAVE)
        }

        val canvas = request.storyEffects!!.canvas!!
        assertThat(canvas.scenes).hasSize(1)
        assertThat(canvas.layout).isNull()
    }

    @Test
    fun `a lone video keeps the old path, no document`() = runTest {
        val request = queued {
            publishPost(content = "", visibility = "PUBLIC", mediaIds = listOf("a"), media = listOf(photo("a").copy(mimeType = "video/mp4")))
        }

        assertThat(request.storyEffects).isNull()
    }

    @Test
    fun `a reel of photos is a reel, not a document of scenes`() = runTest {
        val request = queued {
            publishPost(
                content = "", visibility = "PUBLIC", mediaIds = listOf("a", "b"), type = "REEL",
                media = listOf(photo("a"), photo("b")), layout = MosaicLayoutMode.WAVE,
            )
        }

        assertThat(request.storyEffects).isNull()
    }

    @Test
    fun `the caption and the alt of each photo keep riding the post, not its scene`() = runTest {
        val request = queued {
            publishPost(
                content = "texte", visibility = "PUBLIC", mediaIds = listOf("a", "b"), media = listOf(photo("a"), photo("b")),
                mediaAlt = mapOf("a" to "une plage"), mediaCaption = mapOf("b" to "le soir"),
            )
        }

        assertThat(request.content).isEqualTo("texte")
        assertThat(request.mediaAlt).containsExactly("a", "une plage")
        assertThat(request.mediaCaption).containsExactly("b", "le soir")
        assertThat(request.storyEffects!!.canvas!!.scenes.flatMap { it.objects }.map { it.payload.keys }.flatten())
            .containsNoneOf("caption", "alt")
    }

    @Test
    fun `a colour scene alone still publishes as the background document`() = runTest {
        val request = queued { publishPost(content = "la vue", visibility = "PUBLIC", background = "302B63") }

        assertThat(request.storyEffects).isEqualTo(StoryEffects(background = "302B63"))
    }
}
