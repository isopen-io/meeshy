package me.meeshy.ui.component.bubble

import android.content.Context
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.down
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.moveTo
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.up
import androidx.compose.ui.test.width
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * La bulle vocale joue SUR PLACE : le toucher remonte à l'hôte (le moteur partagé), jamais à une application externe ;
 * glisser sur l'onde désarme le balayage « répondre » de la bulle jusqu'à la levée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleVoicePlayerScrubTest {

    @get:Rule val compose = createComposeRule()
    private val context = ApplicationProvider.getApplicationContext<Context>()
    private val arbiter = BubbleGestureArbiter()
    private val taps = mutableListOf<String>()
    private val seeks = mutableListOf<Double>()

    private fun show(audio: BubbleAudio = voiceNote("a")) {
        compose.setContent {
            CompositionLocalProvider(LocalBubbleGestureArbiter provides arbiter) {
                MeeshyTheme {
                    BubbleVoicePlayer(
                        audio = audio,
                        playback = null,
                        onColor = Color.Black,
                        accent = Color(0xFF6366F1),
                        callbacks = BubbleCallbacks(
                            onAudioClick = { taps += it.attachmentId },
                            onAudioSeekFraction = { _, fraction -> seeks += fraction },
                        ),
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private fun waveform() = compose.onNodeWithContentDescription(context.getString(R.string.audio_player_waveform))

    @Test
    fun `glisser sur l'onde desarme le balayage de la bulle puis le rend a la levee`() {
        show()

        waveform().performTouchInput {
            down(Offset(width * 0.1f, 5f))
            moveTo(Offset(width * 0.6f, 5f))
        }
        compose.waitForIdle()
        assertThat(arbiter.suppressSwipe).isTrue()
        assertThat(seeks.last()).isWithin(0.05).of(0.6)

        waveform().performTouchInput { up() }
        compose.waitForIdle()
        assertThat(arbiter.suppressSwipe).isFalse()
    }

    @Test
    fun `toucher lecture remonte le vocal a l'hote et n'ouvre aucune application`() {
        show()

        compose.onNodeWithContentDescription(context.getString(R.string.media_audio_play)).performClick()
        compose.waitForIdle()

        assertThat(taps).containsExactly("a")
        assertThat(shadowOf(ApplicationProvider.getApplicationContext<android.app.Application>()).nextStartedActivity).isNull()
    }

    @Test
    fun `un vocal sans adresse ne remonte rien`() {
        show(BubbleAudio(attachmentId = "a", durationSeconds = 30))

        compose.onNodeWithContentDescription(context.getString(R.string.media_audio_play)).performClick()
        compose.waitForIdle()

        assertThat(taps).isEmpty()
    }
}
