package me.meeshy.ui.component.media

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.media3.exoplayer.ExoPlayer
import androidx.test.core.app.ApplicationProvider
import androidx.media3.common.Player
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.live.ComposerLiveWindow
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le lecteur en direct du compositeur (#13863, #13973) : UN lecteur par média de la scène, jamais recréé pendant le
 * geste de Couper ; chaque image du geste déplace sa tête, le volume suit à chaud, et il se tait quand la scène ne joue pas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerLivePlayerTest {

    @get:Rule
    val compose = createComposeRule()

    @Before
    fun reset() = PlayerCensus.reset()

    private var window by mutableStateOf(ComposerLiveWindow(2_000, 6_000))
    private var volume by mutableFloatStateOf(1f)
    private var playing by mutableStateOf(true)
    private var player: Player? = null

    private fun show() {
        compose.setContent {
            val live = rememberComposerLivePlayer(mediaUrl = "file:///sdcard/clip.mp4", window = window, volume = volume, playing = playing)
            player = live.player
        }
        compose.waitForIdle()
    }

    @Test
    fun `every frame of the cut gesture keeps the same player`() {
        show()
        (1..10).forEach { step ->
            window = ComposerLiveWindow(2_000L + step * 100, 6_000)
            compose.waitForIdle()
        }

        assertThat(PlayerCensus.created).isEqualTo(1)
    }

    @Test
    fun `the head starts at the start of the window and follows the start handle`() {
        show()
        assertThat(player!!.currentPosition).isEqualTo(2_000)

        window = ComposerLiveWindow(2_400, 6_000)
        compose.waitForIdle()

        assertThat(player!!.currentPosition).isEqualTo(2_400)
    }

    @Test
    fun `the end handle replays the last moments before the new end`() {
        show()
        window = ComposerLiveWindow(2_000, 5_000)
        compose.waitForIdle()

        assertThat(player!!.currentPosition).isEqualTo(3_500)
    }

    @Test
    fun `the volume follows live`() {
        show()
        volume = 0.3f
        compose.waitForIdle()

        assertThat(player!!.volume).isEqualTo(0.3f)
    }

    @Test
    fun `it plays while the scene plays and holds still otherwise`() {
        show()
        assertThat(player!!.playWhenReady).isTrue()

        playing = false
        compose.waitForIdle()

        assertThat(player!!.playWhenReady).isFalse()
    }

    @Test
    fun `the wait ends at the first rendered frame and a later buffering does not bring the ring back`() {
        val watch = ComposerLiveFirstFrame()
        watch.onPlaybackStateChanged(Player.STATE_READY)
        assertThat(watch.waiting.value).isTrue()

        watch.onRenderedFirstFrame()
        watch.onPlaybackStateChanged(Player.STATE_BUFFERING)

        assertThat(watch.waiting.value).isFalse()
    }

    @Test
    fun `while the player waits for its first frame, the scene says it is loading`() {
        val waiting = mutableStateOf(true)
        compose.setContent {
            val state = androidx.compose.runtime.remember {
                ComposerLivePlayerState(ExoPlayer.Builder(ApplicationProvider.getApplicationContext()).build(), waiting)
            }
            ComposerLiveVideo(state, fit = false)
        }

        compose.onNodeWithContentDescription("Loading preview").assertExists()
        compose.onNodeWithTag(COMPOSER_LIVE_VIDEO_TAG).assertExists()

        waiting.value = false
        compose.waitForIdle()

        compose.onNodeWithTag(COMPOSER_LIVE_LOADING_TAG).assertDoesNotExist()
    }
}
