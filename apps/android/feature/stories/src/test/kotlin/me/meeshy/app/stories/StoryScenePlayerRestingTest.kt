package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.media.PlayerCensus
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13663 — une scène AU REPOS (carte de story republiée, réel du fil non élu) est une image fixe : aucun lecteur
 * n'est instancié, ni pour le fond, ni pour les vidéos posées, ni pour les pistes. Seule la scène élue prépare les siens.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryScenePlayerRestingTest {

    @get:Rule
    val compose = createComposeRule()

    private val slide = StorySlideView(
        id = "s",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "1A1A2E",
        backgroundVideoUrl = "file:///sdcard/fond.mp4",
        backgroundAudioUrl = "file:///sdcard/fond.m4a",
        foregroundAudioUrl = "file:///sdcard/voix.m4a",
        foregroundMedia = listOf(
            StoryForegroundMediaView(
                id = "v1", url = "file:///sdcard/pose.mp4", isVideo = true,
                x = 0.5, y = 0.5, scale = 1.0, aspectRatio = 1.0,
            ),
        ),
    )

    private fun playersCreatedBy(resting: Boolean, scene: StorySlideView = slide): Int {
        PlayerCensus.reset()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            StoryScenePlayer(
                slide = scene,
                playing = !resting,
                muted = true,
                loads = true,
                rewindWhenIdle = false,
                resting = resting,
            )
        }
        compose.waitForIdle()
        return PlayerCensus.created
    }

    @Test
    fun `une scene au repos n instancie aucun lecteur`() {
        assertThat(playersCreatedBy(resting = true)).isEqualTo(0)
    }

    @Test
    fun `la scene elue prepare le fond, la video posee et les deux pistes`() {
        assertThat(playersCreatedBy(resting = false)).isEqualTo(4)
    }

    private val hash: String = java.util.Base64.getEncoder()
        .encodeToString(me.meeshy.sdk.model.media.ThumbHash.encode(2, 2, ByteArray(16) { 128.toByte() }))

    private fun posed(posterUrl: String? = null, thumbHash: String? = null) = StoryForegroundMediaView(
        id = "v1", url = "file:///sdcard/pose.mp4", isVideo = true,
        x = 0.5, y = 0.5, scale = 1.0, aspectRatio = 1.0,
        posterUrl = posterUrl, thumbHash = thumbHash,
    )

    private fun count(tag: String) = compose.onAllNodesWithTag(tag).fetchSemanticsNodes().size

    @Test
    fun `au repos un fond video avec vignette peint l affiche, sans lecteur`() {
        val scene = slide.copy(backgroundPosterUrl = "https://cdn.meeshy.me/fond.jpg", backgroundThumbHash = hash, foregroundMedia = emptyList())

        assertThat(playersCreatedBy(resting = true, scene = scene)).isEqualTo(0)
        assertThat(count(STORY_RESTING_POSTER_TAG)).isEqualTo(1)
        assertThat(count(STORY_RESTING_THUMBHASH_TAG)).isEqualTo(0)
    }

    @Test
    fun `au repos un fond video sans vignette mais avec ThumbHash peint le ThumbHash`() {
        val scene = slide.copy(backgroundPosterUrl = null, backgroundThumbHash = hash, foregroundMedia = emptyList())

        assertThat(playersCreatedBy(resting = true, scene = scene)).isEqualTo(0)
        assertThat(count(STORY_RESTING_THUMBHASH_TAG)).isEqualTo(1)
        assertThat(count(STORY_RESTING_POSTER_TAG)).isEqualTo(0)
    }

    @Test
    fun `au repos un fond video sans vignette ni ThumbHash reste l aplat d accent`() {
        val scene = slide.copy(backgroundPosterUrl = null, backgroundThumbHash = null, foregroundMedia = emptyList())

        assertThat(playersCreatedBy(resting = true, scene = scene)).isEqualTo(0)
        assertThat(count(STORY_RESTING_POSTER_TAG)).isEqualTo(0)
        assertThat(count(STORY_RESTING_THUMBHASH_TAG)).isEqualTo(0)
    }

    @Test
    fun `la scene elue joue son fond, elle ne peint pas l affiche`() {
        val scene = slide.copy(backgroundPosterUrl = "https://cdn.meeshy.me/fond.jpg", foregroundMedia = emptyList())

        assertThat(playersCreatedBy(resting = false, scene = scene)).isEqualTo(3)
        assertThat(count(STORY_RESTING_POSTER_TAG)).isEqualTo(0)
    }

    @Test
    fun `au repos une video posee garde son cadre avec son affiche, sans lecteur`() {
        val scene = slide.copy(foregroundMedia = listOf(posed(posterUrl = "https://cdn.meeshy.me/v1.jpg")))

        assertThat(playersCreatedBy(resting = true, scene = scene)).isEqualTo(0)
        assertThat(count(STORY_RESTING_POSTER_TAG)).isEqualTo(1)
    }

    @Test
    fun `au repos une video posee sans vignette retombe sur son ThumbHash`() {
        val scene = slide.copy(foregroundMedia = listOf(posed(thumbHash = hash)))

        assertThat(playersCreatedBy(resting = true, scene = scene)).isEqualTo(0)
        assertThat(count(STORY_RESTING_THUMBHASH_TAG)).isEqualTo(1)
    }

    @Test
    fun `l affiche se decide par la vignette, puis le ThumbHash, puis rien`() {
        assertThat(restingPosterKind("https://x/p.jpg", hash)).isEqualTo(RestingPosterKind.POSTER)
        assertThat(restingPosterKind(" ", hash)).isEqualTo(RestingPosterKind.THUMBHASH)
        assertThat(restingPosterKind(null, hash)).isEqualTo(RestingPosterKind.THUMBHASH)
        assertThat(restingPosterKind(null, " ")).isEqualTo(RestingPosterKind.NONE)
        assertThat(restingPosterKind(null, null)).isEqualTo(RestingPosterKind.NONE)
    }
}
