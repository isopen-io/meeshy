package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performSemanticsAction
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
class AudioFullscreenDialSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val seeks = mutableListOf<Double>()

    private fun label(): String =
        ApplicationProvider.getApplicationContext<android.content.Context>().getString(R.string.audio_fullscreen_dial)

    private fun show(progress: Double) {
        compose.setContent {
            AudioFullscreenDial(
                samples = List(72) { 0.5f },
                progress = progress,
                isPlaying = false,
                portraitDiameter = 120.dp,
                accent = Color.Red,
                trackColor = Color.Gray,
                cursorColor = Color.White,
                totalLabel = "0:30",
                elapsedLabel = "0:12",
                onSeek = { seeks += it },
            )
        }
        compose.waitForIdle()
    }

    @Test
    fun `le cadran annonce son etiquette et la valeur en pourcentage`() {
        show(0.42)
        val node = compose.onNodeWithContentDescription(label()).fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("42 %")
        assertThat(node.config.getOrNull(SemanticsProperties.ProgressBarRangeInfo)?.current).isWithin(1e-4f).of(0.42f)
    }

    @Test
    fun `augmenter avance d un pas de 5 pour cent`() {
        show(0.5)
        compose.onNodeWithContentDescription(label())
            .performSemanticsAction(SemanticsActions.SetProgress) { it(0.9f) }
        assertThat(seeks.single()).isWithin(1e-9).of(0.55)
    }

    @Test
    fun `diminuer recule d un pas et butte a zero`() {
        show(0.02)
        compose.onNodeWithContentDescription(label())
            .performSemanticsAction(SemanticsActions.SetProgress) { it(0.0f) }
        assertThat(seeks.single()).isEqualTo(0.0)
    }
}
