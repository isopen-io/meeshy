package me.meeshy.app.calls

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.calls.R
import me.meeshy.sdk.call.camera.CallCameraZoom
import me.meeshy.sdk.call.camera.CameraZoomActuator
import me.meeshy.sdk.model.call.CallAction
import me.meeshy.sdk.model.call.CallSelfTileMemory
import me.meeshy.sdk.model.call.camera.CameraLens
import me.meeshy.sdk.model.call.camera.CameraZoomPolicy
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallSelfTileEffectsRowTest {
    @get:Rule val rule = createComposeRule()

    private val actuator = object : CameraZoomActuator {
        override fun setCrop(zoom: Float, rampRate: Float?) = Unit
        override fun openLens(lensId: String) = Unit
    }

    private fun zoom(): CallCameraZoom = CallCameraZoom(actuator).also {
        it.attach(CameraZoomPolicy.profile(listOf(CameraLens("m", 1f)), isFront = false, maxDigitalZoom = 8f), "m")
    }

    private fun effectsItem(active: Boolean) = CallPillItem(
        action = CallAction.Effects,
        icon = MeeshyIcons.MagicWand,
        labelRes = R.string.call_control_effects,
        kind = if (active) CallPillKind.Active else CallPillKind.Normal,
    )

    @Test
    fun `the effects button above my tile opens the effects like the pill did`() {
        val tapped = mutableListOf<CallAction>()
        rule.setContent { MeeshyTheme { CallSelfEffectsRow(CallSelfEffects(listOf(effectsItem(active = false)), tapped::add)) } }
        rule.onNodeWithContentDescription("Effects").performClick()
        assertThat(tapped).containsExactly(CallAction.Effects)
    }

    @Test
    fun `a chosen effect lights the button and says it is selected`() {
        rule.setContent { MeeshyTheme { CallSelfEffectsRow(CallSelfEffects(listOf(effectsItem(active = true))) {}) } }
        val node = rule.onNodeWithContentDescription("Effects").fetchSemanticsNode()
        assertThat(node.config.getOrNull(SemanticsProperties.Selected)).isTrue()
    }

    @Test
    fun `my image full screen, the top rail carries effects after the camera controls`() {
        val tapped = mutableListOf<CallAction>()
        rule.setContent {
            MeeshyTheme {
                CallMyImageTopRail(
                    CallSelfCameraActions(zoom(), onFlip = {}, onToggleCamera = {}),
                    isCameraOn = true,
                    effects = CallSelfEffects(listOf(effectsItem(active = false)), tapped::add),
                )
            }
        }
        rule.onNodeWithContentDescription("Switch front/back camera").assertExists()
        rule.onNodeWithContentDescription("Effects").performClick()
        assertThat(tapped).containsExactly(CallAction.Effects)
    }

    @Test
    fun `a video frozen by the app says so on the tile's camera switch`() {
        rule.setContent {
            MeeshyTheme {
                CallSelfTileControlsRow(CallSelfCameraActions(zoom(), onFlip = {}, onToggleCamera = {}), isCameraOn = true, isPaused = true)
            }
        }
        rule.onNodeWithContentDescription("Video paused (weak connection)").assertExists()
    }

    @Test
    @Config(qualifiers = "w360dp-h800dp")
    fun `effects sit above my tile and the camera row below it`() {
        rule.setContent {
            MeeshyTheme {
                CallSelfTile(
                    callKey = "call-1",
                    memory = CallSelfTileMemory(),
                    paused = false,
                    reduceMotion = true,
                    onSwap = {},
                    modifier = Modifier.fillMaxSize(),
                    effectsCount = 1,
                    cameraCount = 2,
                    effectsControls = { Box(Modifier.fillMaxSize().testTag("effects")) },
                    cameraControls = { Box(Modifier.fillMaxSize().testTag("camera")) },
                ) { Box(Modifier.fillMaxSize().testTag("tile")) }
            }
        }
        val tile = rule.onNodeWithTag("tile", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val effects = rule.onNodeWithTag("effects", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        val camera = rule.onNodeWithTag("camera", useUnmergedTree = true).fetchSemanticsNode().boundsInRoot
        assertThat(effects.bottom).isAtMost(tile.top)
        assertThat(camera.top).isAtLeast(tile.bottom)
    }
}
