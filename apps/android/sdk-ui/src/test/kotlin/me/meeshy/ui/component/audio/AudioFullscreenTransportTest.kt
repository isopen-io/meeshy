package me.meeshy.ui.component.audio

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.ProgressBarRangeInfo
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertHeightIsEqualTo
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.hasProgressBarRangeInfo
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le transport : vitesse par paliers (ajustable par TalkBack), ±10 s, lecture 56 dp et sa roue de chargement. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioFullscreenTransportTest {

    @get:Rule
    val compose = createComposeRule()

    private val context get() = ApplicationProvider.getApplicationContext<android.content.Context>()

    private fun speedLabel(speed: PlaybackSpeed) = context.getString(R.string.media_audio_speed_cycle, speed.label)

    private class Recorder {
        var speed by mutableStateOf(PlaybackSpeed.X1_0)
        val skips = mutableListOf<Double>()
        var plays = 0
    }

    private fun show(recorder: Recorder, isPlaying: Boolean = false, isLoading: Boolean = false) {
        compose.setContent {
            AudioFullscreenTransport(
                speed = recorder.speed,
                isPlaying = isPlaying,
                isLoading = isLoading,
                accent = Color.Magenta,
                onSpeedChange = { recorder.speed = it },
                onSkip = { recorder.skips += it },
                onPlayPause = { recorder.plays += 1 },
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun `la pastille avance d un palier par toucher et revient a la normale apres le double`() {
        val recorder = Recorder()
        show(recorder)

        compose.onNodeWithContentDescription(speedLabel(PlaybackSpeed.X1_0)).performClick()
        assertThat(recorder.speed).isEqualTo(PlaybackSpeed.X1_25)

        recorder.speed = PlaybackSpeed.X2_0
        compose.waitForIdle()
        compose.onNodeWithContentDescription(speedLabel(PlaybackSpeed.X2_0)).performClick()
        assertThat(recorder.speed).isEqualTo(PlaybackSpeed.X1_0)
    }

    @Test
    fun `TalkBack diminue la vitesse d un palier`() {
        val recorder = Recorder()
        recorder.speed = PlaybackSpeed.X1_5
        show(recorder)
        val decrease = context.getString(R.string.a11y_kit_decrease)

        val action = compose.onNodeWithContentDescription(speedLabel(PlaybackSpeed.X1_5)).fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].first { it.label == decrease }
        compose.runOnUiThread { action.action() }

        assertThat(recorder.speed).isEqualTo(PlaybackSpeed.X1_25)
    }

    @Test
    fun `reculer et avancer sautent de dix secondes`() {
        val recorder = Recorder()
        show(recorder)

        compose.onNodeWithContentDescription(context.getString(R.string.media_skipBack10s)).performClick()
        compose.onNodeWithContentDescription(context.getString(R.string.media_skipForward10s)).performClick()

        assertThat(recorder.skips).containsExactly(-10.0, 10.0).inOrder()
    }

    @Test
    fun `la lecture tient 56 dp et la pastille offre une cible d au moins 48 dp`() {
        val recorder = Recorder()
        show(recorder)

        compose.onNodeWithContentDescription(context.getString(R.string.media_playAudio))
            .assertHeightIsEqualTo(56.dp)
            .performClick()
        compose.onNodeWithContentDescription(speedLabel(PlaybackSpeed.X1_0))
            .assertHeightIsAtLeast(48.dp)
            .assertWidthIsAtLeast(48.dp)

        assertThat(recorder.plays).isEqualTo(1)
    }

    @Test
    fun `pendant le chargement la lecture montre sa roue`() {
        show(Recorder(), isLoading = true)

        compose.onNode(hasProgressBarRangeInfo(ProgressBarRangeInfo.Indeterminate), useUnmergedTree = true).assertExists()
    }

    @Test
    fun `en lecture le bouton propose la pause`() {
        show(Recorder(), isPlaying = true)

        compose.onNodeWithContentDescription(context.getString(R.string.media_pauseAudio)).assertExists()
    }
}
