package me.meeshy.ui.component.audio.editor

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.down
import androidx.compose.ui.test.moveTo
import androidx.compose.ui.test.up
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.audioedit.AudioEditorSelection
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioEditorWaveformTest {

    @get:Rule
    val compose = createComposeRule()

    private class Probe {
        val scrubs = mutableListOf<Double>()
        val starts = mutableListOf<Double>()
        val ends = mutableListOf<Double>()
        var scrubEnded = 0
    }

    private fun show(probe: Probe, selection: AudioEditorSelection?) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.width(400.dp).height(96.dp)) {
                    AudioEditorWaveform(
                        levels = List(100) { 0.5f },
                        progress = { 0.25 },
                        selection = { selection },
                        accent = Color.Blue,
                        onScrub = { probe.scrubs += it },
                        onScrubEnded = { probe.scrubEnded++ },
                        onSelectionStart = { probe.starts += it },
                        onSelectionEnd = { probe.ends += it },
                    )
                }
            }
        }
    }

    private val waveform get() = compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.ProgressBarRangeInfo))

    @Test
    fun `l'accessibilité annonce la position et la règle déplace la tête`() {
        val probe = Probe()
        show(probe, selection = null)
        val range = waveform.fetchSemanticsNode().config[SemanticsProperties.ProgressBarRangeInfo]
        assertThat(range.current).isEqualTo(0.25f)
        waveform.performSemanticsAction(SemanticsActions.SetProgress) { it(0.6f) }
        assertThat(probe.scrubs.single()).isWithin(1e-6).of(0.6)
        assertThat(probe.scrubEnded).isEqualTo(1)
    }

    @Test
    fun `un glissé loin des poignées déplace la tête et se termine une fois`() {
        val probe = Probe()
        show(probe, AudioEditorSelection(0.1, 0.9, isRemoval = false))
        waveform.performTouchInput {
            down(Offset(width * 0.5f, 10f))
            moveTo(Offset(width * 0.6f, 10f))
            up()
        }
        assertThat(probe.scrubs).isNotEmpty()
        assertThat(probe.scrubs.last()).isWithin(0.02).of(0.6)
        assertThat(probe.starts).isEmpty()
        assertThat(probe.ends).isEmpty()
        assertThat(probe.scrubEnded).isEqualTo(1)
    }

    @Test
    fun `un glissé sur la poignée de début la déplace sans toucher la tête`() {
        val probe = Probe()
        show(probe, AudioEditorSelection(0.1, 0.9, isRemoval = false))
        waveform.performTouchInput {
            down(Offset(width * 0.1f, 10f))
            moveTo(Offset(width * 0.3f, 10f))
            up()
        }
        assertThat(probe.starts.last()).isWithin(0.02).of(0.3)
        assertThat(probe.scrubs).isEmpty()
        assertThat(probe.scrubEnded).isEqualTo(0)
    }

    @Test
    fun `un glissé sur la poignée de fin la déplace`() {
        val probe = Probe()
        show(probe, AudioEditorSelection(0.1, 0.9, isRemoval = true))
        waveform.performTouchInput {
            down(Offset(width * 0.9f, 10f))
            moveTo(Offset(width * 0.7f, 10f))
            up()
        }
        assertThat(probe.ends.last()).isWithin(0.02).of(0.7)
        assertThat(probe.starts).isEmpty()
    }
}
