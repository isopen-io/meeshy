package me.meeshy.app.calls

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
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

    private fun show(zoom: CallCameraZoom, cameraOn: Boolean, taps: Taps) {
        rule.setContent {
            MeeshyTheme {
                CallSelfTileControlsRow(
                    CallSelfCameraActions(zoom, onFlip = { taps.flips++ }, onToggleCamera = { taps.toggles++ }),
                    isCameraOn = cameraOn,
                )
            }
        }
    }

    @Test
    fun `n'affiche que les objectifs que l'appareil possede, puis la bascule a leur cote`() {
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = true, taps = Taps())
        rule.onNodeWithContentDescription("Zoom 1×").assertExists()
        rule.onNodeWithContentDescription("Zoom 2×").assertExists()
        rule.onNodeWithContentDescription("Zoom 3×").assertDoesNotExist()
        rule.onNodeWithContentDescription("Zoom 0.5×").assertDoesNotExist()
        rule.onNode(hasContentDescription("Switch front/back camera", substring = true)).assertExists()
    }

    @Test
    fun `un triple objectif montre 0,5 1 2 3`() {
        show(zoom(listOf(CameraLens("w", 0.5f), CameraLens("m", 1f), CameraLens("t", 3f))), cameraOn = true, taps = Taps())
        listOf("0.5×", "1×", "2×", "3×").forEach { rule.onNodeWithContentDescription("Zoom $it").assertExists() }
    }

    @Test
    fun `toucher une pastille zoome, la bascule bascule`() {
        val z = zoom(listOf(CameraLens("m", 1f)))
        val taps = Taps()
        show(z, cameraOn = true, taps = taps)
        rule.onNodeWithContentDescription("Zoom 2×").performClick()
        assertThat(z.state.value.displayFactor).isEqualTo(2f)
        rule.onNode(hasContentDescription("Switch front/back camera", substring = true)).performClick()
        assertThat(taps.flips).isEqualTo(1)
        assertThat(taps.toggles).isEqualTo(0)
    }

    @Test
    fun `un appui long sur la bascule coupe la camera sans basculer`() {
        val taps = Taps()
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = true, taps = taps)
        rule.onNode(hasContentDescription("Switch front/back camera", substring = true)).performTouchInput { longClick() }
        assertThat(taps.toggles).isEqualTo(1)
        assertThat(taps.flips).isEqualTo(0)
    }

    @Test
    fun `caméra coupée, seule la bascule reste, annonce l'etat et se rallume d'un appui long`() {
        val taps = Taps()
        show(zoom(listOf(CameraLens("m", 1f))), cameraOn = false, taps = taps)
        rule.onNodeWithContentDescription("Zoom 2×").assertDoesNotExist()
        val node = rule.onNode(hasContentDescription("Switch front/back camera", substring = true))
        assertThat(node.fetchSemanticsNode().config.getOrNull(SemanticsProperties.StateDescription)).isEqualTo("Camera off")
        node.performTouchInput { longClick() }
        assertThat(taps.toggles).isEqualTo(1)
    }
}
