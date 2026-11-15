package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.media.MediaUploadItem
import me.meeshy.sdk.media.MediaUploadQueue
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.sdk.model.media.TusUploadContext
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.ApiError
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * #13841 — le four de la publication : chaque image réglée part en copie dérivée, en file d'envoi pour une story neuve,
 * envoyée tout de suite pour une story éditée (l'édition est en ligne seulement) ; un échec de cuisson refuse la
 * publication au lieu de publier l'original en silence.
 */
@RunWith(JUnit4::class)
class StoryLookOvenTest {
    private val queue: MediaUploadQueue = mockk()
    private val uploader: StoryMediaUploader = mockk()
    private val baked = MediaUploadItem(byteArrayOf(1, 2, 3), "story-look-m1.jpg", "image/jpeg")

    private fun media(id: String) =
        UploadedMedia(id = id, url = "2026/10/$id/photo.jpg", mimeType = "image/jpeg", fileSize = 1, width = 1080, height = 1920, durationMs = null, thumbnailUrl = null)

    private fun state(looked: Boolean = true): StoryComposerUiState {
        val slide = StorySlide(
            id = "s",
            mediaIds = listOf("m1"),
            placedMedia = listOf(StoryPlacedMedia("m1")),
            mediaLooks = if (looked) mapOf("m1" to StoryMediaLook(filterPreset = "warm")) else emptyMap(),
        )
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), "s"), attachments = listOf(media("m1")))
    }

    private fun oven(bake: suspend (StoryLookBakeJob) -> MediaUploadItem? = { baked }) = StoryLookOven(bake, queue, uploader)

    @Test
    fun `une story neuve met la copie cuite en file d envoi et ne nomme plus qu elle`() = runTest {
        coEvery { queue.enqueue(baked, TusUploadContext.STORY) } returns "cmid-m1"

        val sent = oven().queued(state())

        assertThat(sent.deck.selectedSlide.mediaIds).containsExactly("cmid-m1")
        assertThat(sent.deck.selectedSlide.placedMedia.single().mediaId).isEqualTo("cmid-m1")
        assertThat(sent.pendingUploads.single().cmid).isEqualTo("cmid-m1")
        assertThat(sent.deck.selectedSlide.mediaLooks).isEmpty()
        coVerify(exactly = 1) { queue.enqueue(baked, TusUploadContext.STORY) }
    }

    @Test
    fun `sans look qui peint, rien ne cuit et la composition part telle quelle`() = runTest {
        val plain = state(looked = false)

        assertThat(oven().queued(plain)).isSameInstanceAs(plain)
        coVerify(exactly = 0) { queue.enqueue(any(), any()) }
    }

    @Test
    fun `une cuisson impossible refuse la publication au lieu de publier l original`() = runTest {
        val failure = runCatching { oven(bake = { null }).queued(state()) }.exceptionOrNull()

        assertThat(failure).isInstanceOf(StoryLookOven.BakeFailed::class.java)
        coVerify(exactly = 0) { queue.enqueue(any(), any()) }
    }

    @Test
    fun `une story editee envoie la copie cuite tout de suite et la compte parmi ses medias`() = runTest {
        coEvery { uploader.upload(listOf(baked), any()) } returns NetworkResult.Success(listOf(media("up-1")))

        val sent = oven().uploaded(state())!!

        assertThat(sent.deck.selectedSlide.mediaIds).containsExactly("up-1")
        assertThat(sent.attachments.map { it.id }).containsExactly("m1", "up-1")
        assertThat(sent.pendingUploads).isEmpty()
        assertThat(sent.deck.selectedSlide.mediaLooks).isEmpty()
    }

    @Test
    fun `une story editee dont la copie ne part pas n enregistre rien`() = runTest {
        coEvery { uploader.upload(any(), any()) } returns NetworkResult.Failure(ApiError(message = "offline", code = "OFFLINE"))

        assertThat(oven().uploaded(state())).isNull()
    }
}
