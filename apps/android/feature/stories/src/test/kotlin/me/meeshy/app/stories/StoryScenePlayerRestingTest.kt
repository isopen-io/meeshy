package me.meeshy.app.stories

import androidx.compose.ui.test.junit4.createComposeRule
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

    private fun playersCreatedBy(resting: Boolean): Int {
        PlayerCensus.reset()
        compose.mainClock.autoAdvance = false
        compose.setContent {
            StoryScenePlayer(
                slide = slide,
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
}
