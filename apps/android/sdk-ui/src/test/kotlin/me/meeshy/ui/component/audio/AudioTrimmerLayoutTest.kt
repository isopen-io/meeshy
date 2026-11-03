package me.meeshy.ui.component.audio

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioTrimmerLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `a toute largeur ni la bande ni les poignees ne depassent le viewport`() {
        var width by mutableStateOf(320.dp)
        val player = AudioTrimPreviewPlayer(RecordingTrimPort(), ManualTrimClock).also { it.load("x") }
        compose.setContent {
            Box(Modifier.width(width).testTag("host")) {
                MeeshyAudioTrimmer(
                    samples = List(512) { 0.3f },
                    duration = 30.0,
                    range = 0.0..30.0,
                    onRangeChange = {},
                    player = player,
                    accent = Color.Blue,
                )
            }
        }
        player.pause()
        compose.waitForIdle()
        listOf(320.dp, 200.dp, 120.dp, 600.dp, 1024.dp).forEach { w ->
            width = w
            compose.waitForIdle()
            val host = compose.onNodeWithTag("host").getBoundsInRoot()
            listOf("Trim strip", "Selection start", "Selection end", "Play selection").forEach { label ->
                val b = compose.onNodeWithContentDescription(label).getBoundsInRoot()
                assertThat(b.left).isAtLeast(host.left - 0.5.dp)
                assertThat(b.right).isAtMost(host.right + 0.5.dp)
            }
        }
    }
}
