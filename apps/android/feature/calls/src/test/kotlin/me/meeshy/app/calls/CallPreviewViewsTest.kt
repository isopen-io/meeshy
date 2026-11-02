package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertIsOff
import androidx.compose.ui.test.assertIsOn
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallPreviewConsent
import me.meeshy.sdk.model.call.CallPreviewExposure
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Les contrôles de l'aperçu avant décroché tels que TalkBack et le doigt les trouvent : « Activer le
 * son » sur l'écran entrant d'un appel qui le propose (et lui seul), son état lu, sa cible ≥ 48 dp ;
 * chez l’appelant, ce que l’appelé reçoit et les deux bascules retenues pour ce contact. Écran d’un
 * Galaxy S8 (360 × 740 dp) : l’appareil de recette.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class CallPreviewViewsTest {
    @get:Rule val rule = createComposeRule()

    private val incoming = CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = false, callId = "c1")

    private fun incomingUi() = CallPresenter.present(CallState.Ringing(false), incoming, CallMedia(), elapsedSeconds = 0)

    private fun incomingScreen(preview: CallPreviewUi, onToggle: () -> Unit = {}) = rule.setContent {
        MeeshyTheme {
            IncomingCallScreen(
                state = incomingUi(),
                peer = CallPeerVisual.EMPTY,
                reduceMotion = true,
                onAccept = {},
                onDecline = {},
                preview = preview,
                onTogglePreviewSound = onToggle,
            )
        }
    }

    @Test
    fun `l'ecran entrant propose d'activer le son et le geste remonte`() {
        var toggles = 0
        incomingScreen(CallPreviewUi(offersSound = true)) { toggles += 1 }

        rule.onNodeWithContentDescription("Turn on sound")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, false))
            .performClick()

        assertThat(toggles).isEqualTo(1)
    }

    @Test
    fun `le bouton du son offre une cible de 48 dp au moins`() {
        rule.setContent { MeeshyTheme { CallPreviewSoundButton(isAudible = false, onToggle = {}) } }

        rule.onNodeWithContentDescription("Turn on sound").assertHeightIsAtLeast(48.dp)
    }

    @Test
    fun `le son active se lit selectionne et propose de le couper`() {
        incomingScreen(CallPreviewUi(offersSound = true, isAudible = true))

        rule.onNodeWithContentDescription("Mute sound")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
    }

    @Test
    fun `sans apercu propose l'ecran entrant reste celui d'avant`() {
        incomingScreen(CallPreviewUi())

        rule.onNodeWithContentDescription("Turn on sound").assertDoesNotExist()
    }

    @Test
    fun `l'appelant lit ce que l'appele recoit et bascule micro et camera de l'apercu`() {
        var audio = 0
        var video = 0
        rule.setContent {
            MeeshyTheme {
                CallPreviewOutgoingPanel(
                    preview = CallPreviewUi(
                        offersOutgoingControls = true,
                        outgoingConsent = CallPreviewConsent.INITIAL,
                        calleeExposure = CallPreviewExposure.Seen,
                    ),
                    peerName = "Bob",
                    isVideoCall = true,
                    onToggleAudio = { audio += 1 },
                    onToggleVideo = { video += 1 },
                )
            }
        }

        rule.onNodeWithText("Bob sees you before answering").assertExists()
        rule.onNodeWithContentDescription("Mic before answering", substring = true).assertIsOff().performClick()
        rule.onNodeWithContentDescription("Camera before answering", substring = true).assertIsOn().performClick()
        assertThat(audio).isEqualTo(1)
        assertThat(video).isEqualTo(1)
    }

    @Test
    fun `hors sonnerie sortante le panneau de l'appelant ne montre rien`() {
        rule.setContent {
            MeeshyTheme {
                CallPreviewOutgoingPanel(CallPreviewUi(), "Bob", isVideoCall = true, onToggleAudio = {}, onToggleVideo = {})
            }
        }

        rule.onNodeWithContentDescription("Mic before answering", substring = true).assertDoesNotExist()
    }
}
