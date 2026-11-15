package me.meeshy.app.stories

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.video.ReelPlayerHandle
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13655 — une scène rejouée en boucle (réel) : quand l'horloge repart de zéro, ce qu'elle joue repart avec elle.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StoryScenePlayerLoopTest {

    @get:Rule
    val compose = createComposeRule()

    private val slide = StorySlideView(
        id = "s",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "1A1A2E",
        backgroundVideoUrl = "file:///sdcard/scene.mp4",
    )

    @Test
    fun `a scene the reader leaves rewinds its background video with its clock`() {
        compose.mainClock.autoAdvance = false
        var elected by mutableStateOf(true)
        var handle: ReelPlayerHandle? = null
        compose.setContent {
            StoryScenePlayer(
                slide = slide,
                playing = elected,
                muted = true,
                loads = true,
                rewindWhenIdle = !elected,
                onBackgroundPlayer = { handle = it },
            )
        }
        compose.waitForIdle()
        val player = checkNotNull(handle)
        player.seekTo(4_000)
        compose.waitForIdle()
        assertThat(player.positionMs()).isEqualTo(4_000)

        elected = false
        compose.mainClock.advanceTimeByFrame()
        compose.waitForIdle()

        assertThat(player.positionMs()).isEqualTo(0)
    }

    @Test
    fun `a scene paused in place keeps its background video where it was`() {
        compose.mainClock.autoAdvance = false
        var playing by mutableStateOf(true)
        var handle: ReelPlayerHandle? = null
        compose.setContent {
            StoryScenePlayer(
                slide = slide,
                playing = playing,
                muted = true,
                loads = true,
                rewindWhenIdle = false,
                onBackgroundPlayer = { handle = it },
            )
        }
        compose.waitForIdle()
        val player = checkNotNull(handle)
        player.seekTo(4_000)
        compose.waitForIdle()

        playing = false
        compose.mainClock.advanceTimeByFrame()
        compose.waitForIdle()

        assertThat(player.positionMs()).isEqualTo(4_000)
    }

    @Test
    fun `a sound that does not loop by itself starts again on every lap of the scene, a looping one never restarts`() {
        assertThat(StorySceneLoop.restartKey(loops = false, lap = 0))
            .isNotEqualTo(StorySceneLoop.restartKey(loops = false, lap = 1))
        assertThat(StorySceneLoop.restartKey(loops = true, lap = 0))
            .isEqualTo(StorySceneLoop.restartKey(loops = true, lap = 7))
    }
}
