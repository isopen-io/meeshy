package me.meeshy.ui.component.audio

import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MeeshyAudioTrimmerGestureTest {

    @get:Rule
    val compose = createComposeRule()

    private val port = RecordingTrimPort()
    private val player = AudioTrimPreviewPlayer(port, ManualTrimClock).also { it.load("file:///a.m4a") }
    private var range by mutableStateOf(10.0..50.0)

    private fun show() {
        compose.setContent {
            MeeshyAudioTrimmer(
                samples = List(512) { 0.2f },
                duration = 60.0,
                range = range,
                onRangeChange = { range = it },
                player = player,
                accent = Color.Blue,
                modifier = Modifier.width(360.dp),
            )
        }
        compose.waitForIdle()
    }

    private fun handle(label: String) = compose.onNodeWithContentDescription(label)
    private val startLabel get() = "Selection start"
    private val endLabel get() = "Selection end"

    @Test
    fun `glisser la poignee de debut deplace la borne puis relancer l'apercu depuis le nouveau debut`() {
        show()
        handle(startLabel).performTouchInput { down(center); moveBy(Offset(60f, 0f)); up() }
        compose.waitForIdle()
        assertThat(range.start).isGreaterThan(10.0)
        assertThat(port.loads.last().second).isEqualTo((range.start * 1000).toLong())
        assertThat(port.loads.last().third).isEqualTo(50_000L)
    }

    @Test
    fun `la poignee de fin ne passe jamais sous le segment minimal`() {
        show()
        handle(endLabel).performTouchInput { down(center); moveBy(Offset(-5000f, 0f)); up() }
        compose.waitForIdle()
        assertThat(range.endInclusive).isAtLeast(range.start + 0.25)
    }

    @Test
    fun `un doigt sur la bande fait defiler la tete sans toucher aux bornes`() {
        show()
        val before = range
        compose.onNodeWithContentDescription("Trim strip").performTouchInput { swipeLeft() }
        compose.waitForIdle()
        assertThat(range).isEqualTo(before)
        assertThat(player.isPlaying.value).isFalse()
    }

    @Test
    fun `le pincement zoome donc eloigne les poignees et une poignee hors champ reste dans la bande`() {
        show()
        val strip = compose.onNodeWithContentDescription("Trim strip")
        val stripBounds = strip.getBoundsInRoot()
        strip.performTouchInput {
            pinch(
                start0 = Offset(centerX - 20f, centerY), end0 = Offset(centerX - 120f, centerY),
                start1 = Offset(centerX + 20f, centerY), end1 = Offset(centerX + 120f, centerY),
            )
        }
        compose.waitForIdle()
        val start = handle(startLabel)
        start.assertIsDisplayed()
        val b = start.getBoundsInRoot()
        assertThat(b.left).isAtLeast(stripBounds.left)
        assertThat(b.right).isAtMost(stripBounds.right)
    }
}
