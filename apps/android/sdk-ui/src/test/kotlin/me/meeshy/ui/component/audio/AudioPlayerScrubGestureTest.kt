package me.meeshy.ui.component.audio

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.test.moveTo
import androidx.compose.ui.test.up
import androidx.compose.ui.test.click
import androidx.compose.ui.test.width
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.R
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioPlayerScrubGestureTest {
    @get:Rule val compose = createComposeRule()
    private val recorded = RecordedActions()

    private fun waveform() = compose.onNodeWithContentDescription(
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.audio_player_waveform),
    )

    private fun show() {
        compose.setContent { PlayerUnderTest(AudioPlayerState(durationSeconds = 30.0), recorded) }
        compose.waitForIdle()
    }

    @Test
    fun `un tap cherche a la position touchee`() {
        show()
        waveform().performTouchInput { click(Offset(width * 0.25f, 5f)) }
        assertThat(recorded.seeks).isNotEmpty()
        assertThat(recorded.seeks.last()).isWithin(0.02).of(0.25)
    }

    @Test
    fun `un glisser publie le signal puis le retire a la levee`() {
        show()
        waveform().performTouchInput {
            down(Offset(width * 0.1f, 5f))
            moveTo(Offset(width * 0.6f, 5f))
        }
        assertThat(recorded.scrubbing).containsExactly(true)
        assertThat(recorded.seeks.last()).isWithin(0.02).of(0.6)
        waveform().performTouchInput { up() }
        assertThat(recorded.scrubbing).containsExactly(true, false).inOrder()
    }
}
