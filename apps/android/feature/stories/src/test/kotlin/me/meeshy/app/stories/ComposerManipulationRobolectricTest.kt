package me.meeshy.app.stories

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.pinch
import androidx.compose.ui.test.swipe
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import kotlin.math.abs
import me.meeshy.ui.story.canvas.edit.sceneManipulationGestures
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** La manipulation d'un objet du canevas : un doigt déplace seulement, deux doigts déplacent, pincent et tournent ensemble. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerManipulationRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private class Recorder {
        var pan = Offset.Zero
        var zoom = 1f
        var rotationDeg = 0f
        var begun = 0
        var ended = 0
        var longPressed = 0
    }

    private fun mount(enabled: Boolean = true): Recorder {
        val rec = Recorder()
        compose.setContent {
            Box(
                Modifier.size(300.dp, 400.dp).testTag("canvas")
                    .pointerInput(Unit) { detectTapGestures(onLongPress = { rec.longPressed++ }) }
                    .sceneManipulationGestures(
                    enabled = enabled,
                    onBegin = { rec.begun++ },
                    onChange = { pan, zoom, rotation ->
                        rec.pan += pan
                        rec.zoom *= zoom
                        rec.rotationDeg += rotation
                    },
                    onEnd = { rec.ended++ },
                ),
            )
        }
        return rec
    }

    @Test
    fun `un doigt deplace sans pincer ni tourner`() {
        val rec = mount()
        compose.onNodeWithTag("canvas").performTouchInput { swipe(Offset(100f, 100f), Offset(200f, 100f)) }

        assertThat(rec.pan.x).isGreaterThan(50f)
        assertThat(rec.zoom).isEqualTo(1f)
        assertThat(rec.rotationDeg).isEqualTo(0f)
        assertThat(rec.begun).isEqualTo(1)
        assertThat(rec.ended).isEqualTo(1)
    }

    @Test
    fun `deux doigts agrandissent et tournent en meme temps`() {
        val rec = mount()
        compose.onNodeWithTag("canvas").performTouchInput {
            pinch(
                start0 = Offset(100f, 200f),
                end0 = Offset(150f, 100f),
                start1 = Offset(200f, 200f),
                end1 = Offset(150f, 300f),
            )
        }

        assertThat(rec.zoom).isGreaterThan(1.5f)
        assertThat(abs(rec.rotationDeg)).isGreaterThan(45f)
    }

    @Test
    fun `un appui long qui tremble sous le seuil reste un appui long et ne peint aucun repere`() {
        val rec = mount()
        compose.onNodeWithTag("canvas").performTouchInput {
            down(Offset(150f, 200f))
            moveBy(Offset(1f, 1f))
            advanceEventTime(viewConfiguration.longPressTimeoutMillis + 100)
            moveBy(Offset(-1f, 0f))
            up()
        }

        assertThat(rec.longPressed).isEqualTo(1)
        assertThat(rec.pan).isEqualTo(Offset.Zero)
        assertThat(rec.begun).isEqualTo(0)
        assertThat(rec.ended).isEqualTo(0)
    }

    @Test
    fun `desactive, le geste ne s'installe pas`() {
        val rec = mount(enabled = false)
        compose.onNodeWithTag("canvas").performTouchInput { swipe(Offset(100f, 100f), Offset(200f, 100f)) }

        assertThat(rec.pan).isEqualTo(Offset.Zero)
        assertThat(rec.begun).isEqualTo(0)
    }
}
