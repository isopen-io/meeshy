package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import coil.Coil
import coil.ImageLoader
import coil.intercept.Interceptor
import coil.request.ErrorResult
import coil.request.ImageResult
import com.google.common.truth.Truth.assertThat
import java.util.concurrent.CopyOnWriteArrayList
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13636 (recette S8) — la passerelle sert la CLÉ d'un média envoyé (`2026/10/<id>/x.png`), jamais une URL. Remise telle
 * quelle à Coil, aucune image ne se peint : vignette de l'étagère blanche, média posé invisible sur la scène, fond vide.
 * Le composeur la résout comme le lecteur (`resolveMediaUrl`), sur chacune de ses surfaces.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerServedMediaAddressTest {

    @get:Rule
    val compose = createComposeRule()

    @After
    fun resetImageLoader() = Coil.reset()

    private val base = "https://gate.staging.meeshy.me/api/v1/"
    private val served = "https://gate.staging.meeshy.me/api/v1/attachments/file/"

    private fun photo(id: String = "p") = UploadedMedia(
        id = id,
        url = "2026/10/u/$id.png",
        mimeType = "image/png",
        fileSize = 1L,
        width = 600,
        height = 900,
        durationMs = null,
        thumbnailUrl = "2026/10/u/${id}_thumb.webp",
    )

    private fun video(id: String = "v") = photo(id).copy(url = "2026/10/u/$id.mp4", mimeType = "video/mp4")

    private fun stateWith(vararg media: UploadedMedia, placed: Boolean = false): StoryComposerUiState {
        val slide = StorySlide(
            id = "s",
            mediaIds = media.map { it.id },
            placedMedia = if (placed) media.map { StoryPlacedMedia(it.id) } else emptyList(),
        )
        return StoryComposerUiState(deck = StorySlideDeck(listOf(slide), slide.id), attachments = media.toList())
    }

    @Test
    fun `a served key becomes the gateway address the reader loads`() {
        assertThat(ComposerMediaAddress.of("2026/10/u/p.png", base)).isEqualTo("${served}2026/10/u/p.png")
    }

    @Test
    fun `an address of the device is not a key and is left as it is`() {
        assertThat(ComposerMediaAddress.of("content://media/external/images/7", base)).isEqualTo("content://media/external/images/7")
        assertThat(ComposerMediaAddress.of("file:///data/user/0/x.png", base)).isEqualTo("file:///data/user/0/x.png")
    }

    @Test
    fun `an empty address names no media and gets no route`() {
        assertThat(ComposerMediaAddress.of("", base)).isEmpty()
    }

    @Test
    fun `a placed photo is painted from its served thumbnail`() {
        val frame = stateWith(photo(), placed = true).placedMediaFrames(mediaBaseUrl = base).single()

        assertThat(frame.model).isEqualTo("${served}2026/10/u/p_thumb.webp")
    }

    @Test
    fun `a placed video is painted from its served poster`() {
        val frame = stateWith(video(), placed = true).placedMediaFrames(mediaBaseUrl = base).single()

        assertThat(frame.model).isEqualTo("${served}2026/10/u/v_thumb.webp")
    }

    @Test
    fun `the scene backdrop is loaded from the served address`() {
        assertThat(stateWith(photo()).selectedSlideBackdropModel(mediaBaseUrl = base)).isEqualTo("${served}2026/10/u/p_thumb.webp")
    }

    @Test
    fun `the slide rail tile is loaded from the served address`() {
        val state = stateWith(photo())

        assertThat(state.thumbnailBackgroundOf(state.deck.selectedSlide, mediaBaseUrl = base)?.model)
            .isEqualTo("${served}2026/10/u/p_thumb.webp")
    }

    @Test
    fun `the shelf tile asks the image loader for the served address, never for the bare key`() {
        val requested = CopyOnWriteArrayList<Any>()
        val recorder = object : Interceptor {
            override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
                requested += chain.request.data
                return ErrorResult(null, chain.request, IllegalStateException("not loaded in a test"))
            }
        }
        Coil.setImageLoader(
            ImageLoader.Builder(ApplicationProvider.getApplicationContext()).components { add(recorder) }.build(),
        )

        compose.setContent {
            MeeshyTheme {
                MediaPreviewRow(
                    attachments = listOf(photo()),
                    pending = emptyList(),
                    mediaBaseUrl = base,
                    backgroundMediaId = null,
                    backgroundIsVideo = false,
                    backgroundLoop = false,
                    onRemove = {},
                    onToggleBackground = {},
                    onToggleBackgroundLoop = {},
                )
            }
        }
        compose.waitUntil(timeoutMillis = 5_000) { requested.isNotEmpty() }

        assertThat(requested).containsExactly("${served}2026/10/u/p_thumb.webp")
    }
}
