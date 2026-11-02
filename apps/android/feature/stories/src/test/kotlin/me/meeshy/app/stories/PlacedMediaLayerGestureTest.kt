package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #13636 — un média posé suit le doigt, quelles que soient son échelle et sa rotation. Le geste vit DANS le calque
 * mis à l'échelle et pivoté : le glissé y est mesuré dans cet espace, il fallait le rapporter à celui du canevas.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlacedMediaLayerGestureTest {

    @get:Rule
    val compose = createComposeRule()

    private val canvasWidthPx = 300f
    private val canvasHeightPx = 400f

    private fun dragged(placed: StoryPlacedMedia, finger: Offset): Pair<Float, Float> {
        var dx = 0f
        var dy = 0f
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(300.dp, 400.dp).testTag("canvas")) {
                    PlacedMediaLayer(
                        frame = PlacedMediaFrame(placed, model = null),
                        canvasWidthPx = canvasWidthPx,
                        canvasHeightPx = canvasHeightPx,
                        gestures = PlacedMediaGestures(
                            onDrag = { _, x, y -> dx += x; dy += y },
                            onDragEnd = {},
                            onTransform = { _, _, _ -> },
                        ),
                    )
                }
            }
        }
        compose.onNodeWithTag("canvas").performTouchInput {
            down(Offset(150f, 200f))
            moveBy(finger)
            up()
        }
        return dx * canvasWidthPx to dy * canvasHeightPx
    }

    @Test
    fun `a media doubled in size follows the finger by the distance it travelled`() {
        val (dx, dy) = dragged(StoryPlacedMedia("m", scale = 2f), Offset(100f, 0f))

        assertThat(dx).isWithin(0.5f).of(100f)
        assertThat(dy).isWithin(0.5f).of(0f)
    }

    @Test
    fun `a media turned a quarter follows the finger in the direction it travelled`() {
        val (dx, dy) = dragged(StoryPlacedMedia("m", rotationDeg = 90f), Offset(100f, 0f))

        assertThat(dx).isWithin(0.5f).of(100f)
        assertThat(dy).isWithin(0.5f).of(0f)
    }

    @Test
    fun `scale and rotation compose`() {
        val (dx, dy) = dragged(StoryPlacedMedia("m", scale = 1.5f, rotationDeg = 180f), Offset(60f, 40f))

        assertThat(dx).isWithin(0.5f).of(60f)
        assertThat(dy).isWithin(0.5f).of(40f)
    }

    @Test
    fun `the pan taken inside a scaled and turned layer is carried back to the canvas`() {
        val onCanvas = PlacedMediaPan.toCanvas(Offset(10f, 0f), scale = 2f, rotationDeg = 90f)

        assertThat(onCanvas.x).isWithin(1e-4f).of(0f)
        assertThat(onCanvas.y).isWithin(1e-4f).of(20f)
    }
}
