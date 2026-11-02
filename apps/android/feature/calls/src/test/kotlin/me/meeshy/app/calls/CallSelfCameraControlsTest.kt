package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.call.camera.CameraZoomActuator
import me.meeshy.sdk.model.call.camera.CameraLens
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallSelfCameraControlsTest {
    @get:Rule val rule = createComposeRule()

    private val actuator = object : CameraZoomActuator {
        override fun setCrop(zoom: Float, rampRate: Float?) = Unit
        override fun openLens(lensId: String) = Unit
    }

    private fun zoom(lenses: List<CameraLens>): CallCameraZoom = CallCameraZoom(actuator).also {
        it.attach(CameraZoomPolicy.profile(lenses, isFront = false, maxDigitalZoom = 8f), lenses.first { l -> l.ratio == 1f }.id)
    }

    private class Taps {
        var flips = 0
        var toggles = 0
    }

    private fun show(zoom: CallCameraZoom, cameraOn: Boolean, taps: Taps, onPick: (() -> Unit)? = null) {
        rule.setContent {
            MeeshyTheme {
                CallSelfTileControlsRow(
                    CallSelfCameraActions(zoom, onFlip = { taps.flips++ }, onToggleCamera = { taps.toggles++ }),
                    isCameraOn = cameraOn,
                    onPickCamera = onPick,
                )
            }
        }
    }

    @Test
    fun `la rangee de ma camera porte la bascule puis l'allumage, jamais le zoom`() {
        val taps = Taps()
        show(zoom(listOf(CameraLens("w", 0.5f), CameraLens("m", 1f))), cameraOn = true, taps = taps)
        rule.onNodeWithContentDescription("Zoom 0.5×").assertDoesNotExist()
        rule.onNodeWithContentDescription("Switch front/back camera").performClick()
        rule.onNodeWithContentDescription("Turn camera off").performClick()
        assertThat(taps.flips).isEqualTo(1)
        assertThat(taps.toggles).isEqualTo(1)
    }

    @Test
    fun `l'allumage dit l'etat de la camera`() {
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = true, taps = Taps())
        val node = rule.onNodeWithContentDescription("Turn camera off").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Camera on")
    }

    @Test
    fun `camera coupee, seul l'allumage reste`() {
        val taps = Taps()
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = false, taps = taps)
        rule.onNodeWithContentDescription("Switch front/back camera").assertDoesNotExist()
        rule.onNodeWithContentDescription("Turn camera on").performClick()
        assertThat(taps.toggles).isEqualTo(1)
    }

    @Test
    fun `une camera branchee remplace la bascule par le choix de camera`() {
        val taps = Taps()
        var picks = 0
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = true, taps = taps, onPick = { picks++ })
        rule.onNodeWithContentDescription("Switch front/back camera").assertDoesNotExist()
        rule.onNodeWithContentDescription("Choose camera").performClick()
        assertThat(picks).isEqualTo(1)
        assertThat(taps.flips).isEqualTo(0)
    }

    @Test
    fun `dans ma vignette un seul bouton passe au palier suivant puis revient au plus large`() {
        val z = zoom(listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f)))
        rule.setContent { MeeshyTheme { CallZoomCycleButton(z) } }
        val button = rule.onNodeWithContentDescription("My camera zoom")
        assertThat(button.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("1×")
        button.performClick()
        assertThat(z.state.value.displayFactor).isEqualTo(2f)
        button.performClick()
        button.performClick()
        assertThat(z.state.value.displayFactor).isEqualTo(0.5f)
    }

    @Test
    fun `mon image en plein ecran porte les pastilles de chaque palier sous la rangee`() {
        val z = zoom(listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f)))
        rule.setContent {
            MeeshyTheme {
                CallMyImageTopRail(CallSelfCameraActions(z, onFlip = {}, onToggleCamera = {}), isCameraOn = true)
            }
        }
        listOf("0.5×", "1×", "2×", "3×").forEach { rule.onNodeWithContentDescription("Zoom $it").assertExists() }
        rule.onNodeWithContentDescription("Switch front/back camera").assertExists()
        rule.onNodeWithContentDescription("Zoom 3×").performClick()
        assertThat(z.state.value.displayFactor).isEqualTo(3f)
    }

    @Test
    fun `un seul objectif ne montre que les paliers que le capteur atteint`() {
        val z = zoom(listOf(CameraLens("m", 1f)))
        rule.setContent {
            MeeshyTheme { CallMyImageTopRail(CallSelfCameraActions(z, onFlip = {}, onToggleCamera = {}), isCameraOn = true) }
        }
        rule.onNodeWithContentDescription("Zoom 1×").assertExists()
        rule.onNodeWithContentDescription("Zoom 2×").assertExists()
        rule.onNodeWithContentDescription("Zoom 0.5×").assertDoesNotExist()
    }
}
