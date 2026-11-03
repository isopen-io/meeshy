package me.meeshy.ui.component.audio

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
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
class AudioPlayerViewSemanticsTest {
    @get:Rule val compose = createComposeRule()
    private val recorded = RecordedActions()

    private fun str(id: Int, vararg args: Any) =
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(id, *args)

    private fun show(state: AudioPlayerState) {
        compose.setContent { PlayerUnderTest(state, recorded) }
        compose.waitForIdle()
    }

    @Test
    fun `le bouton annonce Lire l audio et mesure au moins 48 dp`() {
        show(AudioPlayerState(durationSeconds = 30.0))
        compose.onNodeWithContentDescription(str(R.string.media_audio_play))
            .assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp).performClick()
        assertThat(recorded.plays).isEqualTo(1)
    }

    @Test
    fun `l onde annonce la progression consommee au repos`() {
        show(AudioPlayerState(durationSeconds = 30.0, restingFraction = 0.42))
        val node = compose.onNodeWithContentDescription(str(R.string.audio_player_waveform)).fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("42 %")
        assertThat(node.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)?.current).isWithin(1e-4f).of(0.42f)
    }

    @Test
    fun `la puce pourcentage ouvre le plein ecran avec son libelle`() {
        show(AudioPlayerState(durationSeconds = 30.0, restingFraction = 0.5))
        compose.onNodeWithContentDescription(str(R.string.media_audio_open_fullscreen, 50))
            .assertWidthIsAtLeast(48.dp).performClick()
        assertThat(recorded.fullscreens).isEqualTo(1)
    }

    @Test
    fun `la puce vitesse cycle et annonce la vitesse`() {
        show(AudioPlayerState(durationSeconds = 30.0))
        compose.onNodeWithContentDescription(str(R.string.media_audio_speed_cycle, "1×")).performClick()
        assertThat(recorded.cycles).isEqualTo(1)
    }
}
