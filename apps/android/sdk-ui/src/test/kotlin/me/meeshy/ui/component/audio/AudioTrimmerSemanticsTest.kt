package me.meeshy.ui.component.audio

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.assertIsDisplayed
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioTrimmerSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val player = AudioTrimPreviewPlayer(RecordingTrimPort(), ManualTrimClock).also { it.load("x") }

    private fun show() {
        compose.setContent {
            MeeshyAudioTrimmer(
                samples = List(512) { 0.3f },
                duration = 90.0,
                range = 5.0..65.0,
                onRangeChange = {},
                player = player,
                accent = Color.Blue,
            )
        }
        compose.waitForIdle()
    }

    private fun stateOf(label: String) = compose.onNodeWithContentDescription(label)
        .fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)

    @Test
    fun `les poignees se nomment et vocalisent leur duree`() {
        show()
        assertThat(stateOf("Selection start")).isEqualTo("5 seconds")
        assertThat(stateOf("Selection end")).isEqualTo("1 minute 5 seconds")
    }

    @Test
    fun `le bouton se nomme Ecouter la selection puis Arreter une fois lance`() {
        show()
        compose.onNodeWithContentDescription("Stop").assertIsDisplayed()
        player.pause()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Play selection").performClick()
        compose.waitForIdle()
        compose.onNodeWithContentDescription("Stop").assertIsDisplayed()
    }

    @Test
    fun `la bande porte son libelle`() {
        show()
        compose.onNodeWithContentDescription("Trim strip").assertIsDisplayed()
    }
}
