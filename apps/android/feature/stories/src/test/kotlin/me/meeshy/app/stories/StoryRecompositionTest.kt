package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.ApiPostMedia
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.story.StoryRepository
import org.junit.Test

/**
 * #13849 — **« Composer » depuis une story sème la scène ENTIÈRE** (iOS `StoryRecomposition` + `StoryRecompositionSeeding`) :
 * ses textes, stickers, lieux, son fond, ses médias posés et ses sons, chaque média rapatrié puis téléversé à nouveau sous
 * le compte de l'auteur. Un média qui ne revient pas fait REFUSER la recomposition, dite : jamais une scène amputée.
 */
class StoryRecompositionTest {

    private fun media(id: String, mime: String = "image/jpeg") =
        ApiPostMedia(id = id, fileUrl = "https://cdn/$id", mimeType = mime, width = 1080, height = 1920)

    private fun post(effects: StoryEffects, media: List<ApiPostMedia>, author: String = "someone") = ApiPost(
        id = "story1",
        type = "STORY",
        content = "Coucher de soleil",
        author = ApiAuthor(id = author, username = author),
        media = media,
        storyEffects = effects,
    )

    private val scene = StoryEffects(
        textObjects = listOf(StoryTextObject(id = "t1", text = "Salut")),
        mediaObjects = listOf(
            StoryMediaObject(id = "bgObj", postMediaId = "bg", isBackground = true),
            StoryMediaObject(id = "pObj", postMediaId = "p", x = 0.3),
        ),
        audioPlayerObjects = listOf(
            StoryAudioPlayerObject(id = "voice", postMediaId = "a"),
            StoryAudioPlayerObject(id = "library", soundId = "snd1", mediaURL = "https://cdn/library.m4a"),
        ),
    )
    private val served = post(scene, listOf(media("bg"), media("p"), media("a", "audio/mp4")))

    private fun uploaded(id: String, mime: String = "image/jpeg") =
        UploadedMedia(id = id, url = "/mine/$id", mimeType = mime, fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = null)

    @Test
    fun `the plan rehomes every media the scene shows or plays, never a borrowed library sound`() {
        val plan = StoryRecomposition.plan(served) as StoryRecomposition.Plan.Ready

        assertThat(plan.assets.map { it.mediaId }).containsExactly("bg", "p", "a").inOrder()
        assertThat(plan.assets.map { it.url }).containsExactly("https://cdn/bg", "https://cdn/p", "https://cdn/a").inOrder()
        assertThat(plan.assets.last().mimeType).isEqualTo("audio/mp4")
    }

    @Test
    fun `a sticker the composer cannot paint refuses the recomposition instead of dropping it`() {
        val withImageSticker = post(scene.copy(stickerObjects = listOf(StorySticker(id = "k", postMediaId = "img"))), served.media.orEmpty())

        assertThat(StoryRecomposition.plan(withImageSticker)).isEqualTo(StoryRecomposition.Plan.Refused)
    }

    @Test
    fun `a story with nothing to recompose is refused`() {
        assertThat(StoryRecomposition.plan(post(StoryEffects(), emptyList()).copy(content = ""))).isEqualTo(StoryRecomposition.Plan.Refused)
    }

    @Test
    fun `the rehomed scene names only the author's new media, background, placed media and own sound alike`() {
        val plan = StoryRecomposition.plan(served) as StoryRecomposition.Plan.Ready
        val fresh = listOf(uploaded("BG"), uploaded("P"), uploaded("A", "audio/mp4"))

        val applied = StoryRecomposition.applied(StoryComposerUiState(), plan, fresh)

        val slide = applied.deck.selectedSlide
        assertThat(slide.mediaIds).containsExactly("BG", "P").inOrder()
        assertThat(slide.backgroundMediaId).isEqualTo("BG")
        assertThat(slide.placedMedia.map { it.mediaId }).containsExactly("P")
        assertThat(slide.audio.first { it.id == "voice" }.postMediaId).isEqualTo("A")
        assertThat(slide.audio.first { it.id == "voice" }.mediaURL).isEqualTo("/mine/A")
        assertThat(slide.audio.first { it.id == "library" }.mediaURL).isEqualTo("https://cdn/library.m4a")
        assertThat(slide.elements.map { it.text }).containsExactly("Salut")
        assertThat(slide.text).isEqualTo("Coucher de soleil")
        assertThat(applied.attachments.map { it.id }).containsExactly("BG", "P", "A")
        assertThat(applied.editing).isFalse()
        assertThat(applied.draft.repostOfId).isNull()
    }

    @Test
    fun `the recomposer fetches each media, uploads them as the author's, and seeds the scene`() = runTest {
        val reader: StoryServedReader = mockk { coEvery { read("story1") } returns ServedStory(served, ServedStoryEffects(null)) }
        val uploader: StoryMediaUploader = mockk {
            coEvery { upload(any(), any()) } returns NetworkResult.Success(listOf(uploaded("BG"), uploaded("P"), uploaded("A", "audio/mp4")))
        }
        val fetched = mutableListOf<String>()
        val recomposer = StoryRecomposer(reader, mockk<StoryRepository>(relaxed = true), uploader) { asset ->
            fetched += asset.url
            MediaUploadItem(ByteArray(1), asset.mediaId, asset.mimeType)
        }

        val ready = recomposer.recompose("story1")

        assertThat(fetched).containsExactly("https://cdn/bg", "https://cdn/p", "https://cdn/a").inOrder()
        assertThat(ready!!.uploaded.map { it.id }).containsExactly("BG", "P", "A").inOrder()
    }

    @Test
    fun `a media that does not come back, or an upload refused, refuses the whole recomposition`() = runTest {
        val reader: StoryServedReader = mockk { coEvery { read("story1") } returns ServedStory(served, ServedStoryEffects(null)) }
        val uploader: StoryMediaUploader = mockk {
            coEvery { upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "refused", code = "X"))
        }
        val missing = StoryRecomposer(reader, mockk<StoryRepository>(relaxed = true), uploader) { asset ->
            if (asset.mediaId == "p") null else MediaUploadItem(ByteArray(1), asset.mediaId, asset.mimeType)
        }
        val refused = StoryRecomposer(reader, mockk<StoryRepository>(relaxed = true), uploader) { asset ->
            MediaUploadItem(ByteArray(1), asset.mediaId, asset.mimeType)
        }

        assertThat(missing.recompose("story1")).isNull()
        assertThat(refused.recompose("story1")).isNull()
    }

    /** iOS `composableSlide` : « Composer » n'est offert que sur une story qu'il saura reprendre — jamais un refus après coup. */
    @Test
    fun `Compose is offered only on a story the composer can take back whole`() {
        assertThat(StoryRecomposition.offered(served.storyEffects, served.content, served.media.orEmpty().size)).isTrue()
        assertThat(StoryRecomposition.offered(scene.copy(stickerObjects = listOf(StorySticker(id = "k", postMediaId = "img"))), "x", 1)).isFalse()
        assertThat(StoryRecomposition.offered(scene.copy(stickerObjects = listOf(StorySticker(id = "k", templateId = "tpl"))), "x", 1)).isFalse()
        assertThat(StoryRecomposition.offered(StoryEffects(), "", 0)).isFalse()
        assertThat(StoryRecomposition.offered(null, null, 0)).isFalse()
    }

    /** iOS `carriesMatter` compte le fond : une story d'une couleur seule se recompose. */
    @Test
    fun `a story carrying only its background colour is recomposed with it`() {
        val plan = StoryRecomposition.plan(post(StoryEffects(background = "#112233"), emptyList()).copy(content = ""))

        assertThat(plan).isInstanceOf(StoryRecomposition.Plan.Ready::class.java)
        assertThat(StoryRecomposition.offered(StoryEffects(background = "#112233"), "", 0)).isTrue()
    }

    /** iOS `StoryRecompositionSeeding` : les téléchargements partent ENSEMBLE, jamais un aller-retour par média à la file. */
    @Test
    fun `the recomposer fetches every media at once, not one after the other`() = runTest {
        val reader: StoryServedReader = mockk { coEvery { read("story1") } returns ServedStory(served, ServedStoryEffects(null)) }
        val uploader: StoryMediaUploader = mockk {
            coEvery { upload(any(), any()) } returns NetworkResult.Success(listOf(uploaded("BG"), uploaded("P"), uploaded("A", "audio/mp4")))
        }
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        var started = 0
        val recomposer = StoryRecomposer(reader, mockk<StoryRepository>(relaxed = true), uploader) { asset ->
            started += 1
            if (started == plan().assets.size) gate.complete(Unit)
            gate.await()
            MediaUploadItem(ByteArray(1), asset.mediaId, asset.mimeType)
        }

        val ready = kotlinx.coroutines.withTimeoutOrNull(5_000) { recomposer.recompose("story1") }

        assertThat(ready).isNotNull()
        assertThat(ready!!.uploaded.map { it.id }).containsExactly("BG", "P", "A").inOrder()
    }

    private fun plan() = StoryRecomposition.plan(served) as StoryRecomposition.Plan.Ready
}
