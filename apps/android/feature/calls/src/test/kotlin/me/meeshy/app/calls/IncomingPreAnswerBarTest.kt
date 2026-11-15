package me.meeshy.app.calls

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.IncomingPreAnswer
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * P17.6 à P17.8 : la barre de verre d'avant le décroché — la phrase de ce que l'autre recevra, puis Micro et Caméra.
 * Un bouton actif est un disque blanc plein : Micro quand il est COUPÉ, Caméra quand elle FILME vraiment.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class IncomingPreAnswerBarTest {
    @get:Rule val rule = createComposeRule()

    private val mute = "Mute microphone"
    private val unmute = "Unmute microphone"
    private val cameraOff = "Turn off camera"
    private val cameraOn = "Turn on camera"

    private fun bar(choice: IncomingPreAnswer, hasTrack: Boolean, onMic: () -> Unit = {}, onCamera: () -> Unit = {}) = rule.setContent {
        MeeshyTheme {
            IncomingPreAnswerBar(
                peerName = "Awa",
                choice = choice,
                hasLocalVideoTrack = hasTrack,
                onToggleMicrophone = onMic,
                onToggleCamera = onCamera,
            )
        }
    }

    @Test
    fun `par defaut la barre dit qu'Awa verra et entendra, Micro inactif et Camera active`() {
        bar(IncomingPreAnswer(), hasTrack = true)

        rule.onNodeWithText("Awa will see you when you answer").assertIsDisplayed()
        rule.onNodeWithContentDescription(mute).assertIsOff()
        rule.onNodeWithContentDescription(cameraOff).assertIsOn()
    }

    @Test
    fun `la phrase promet vous verra seulement si la camera filme vraiment`() {
        bar(IncomingPreAnswer(), hasTrack = false)

        rule.onNodeWithText("Awa will hear you without seeing you").assertIsDisplayed()
        rule.onNodeWithContentDescription(cameraOff).assertIsOff()
    }

    @Test
    fun `micro coupe, la phrase le dit et Micro devient un disque actif`() {
        bar(IncomingPreAnswer().togglingMicrophone(), hasTrack = true)

        rule.onNodeWithText("Awa will see you, microphone off").assertIsDisplayed()
        rule.onNodeWithContentDescription(unmute).assertIsOn()
    }

    @Test
    fun `ni micro ni camera, Awa ne verra ni n'entendra`() {
        bar(IncomingPreAnswer().togglingMicrophone().togglingCamera(), hasTrack = true)

        rule.onNodeWithText("Awa will neither see nor hear you").assertIsDisplayed()
        rule.onNodeWithContentDescription(cameraOn).assertIsOff()
    }

    @Test
    fun `chaque bascule remonte son geste, et seulement le sien`() {
        val taps = mutableListOf<String>()
        bar(IncomingPreAnswer(), hasTrack = true, onMic = { taps += "mic" }, onCamera = { taps += "camera" })

        rule.onNodeWithContentDescription(mute).performClick()
        rule.onNodeWithContentDescription(cameraOff).performClick()

        assertThat(taps).containsExactly("mic", "camera").inOrder()
    }

    @Test
    fun `les bascules offrent des cibles de 48 dp au moins`() {
        bar(IncomingPreAnswer(), hasTrack = true)

        listOf(mute, cameraOff).forEach { description ->
            rule.onNodeWithContentDescription(description).assertHeightIsAtLeast(48.dp).assertWidthIsAtLeast(48.dp)
        }
    }
}
