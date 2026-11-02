package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.assertWidthIsAtLeast
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Options
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Surface
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Un clavier posé, d'une hauteur connue : les encarts IME ne sont pas fiables sous Robolectric. */
internal class FixedTypingKeyboard(private val heightDp: Float) : TypingKeyboard {
    override fun bottom(density: Density): Float = heightDp
    override fun target(density: Density): Float = heightDp
}

/**
 * L'état de frappe (#13835, maquette du 2026-10-30, état 2) : la scène se réduit, ENTIÈRE et 9:16, au-dessus d'une barre
 * fine collée au clavier (Aa, ●, ≡, ▣, OK) ; toucher une icône remplace le clavier par ses seuls choix, à la hauteur du
 * clavier — la barre et la scène ne bougent pas ; aucune surimpression pendant la frappe.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1300dp-h1000dp")
class ComposerKeyboardStyleBarTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(surface: () -> Surface = { Surface.Keyboard }, onOption: (Options) -> Unit = {}, onDone: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(width = 360.dp, height = 692.dp)) {
                    StorySceneFirstLayout(
                        onDismiss = {},
                        reduced = false,
                        scene = { modifier -> Box(modifier.testTag(SCENE)) },
                        top = { Text(CLOSE_OVERLAY) },
                        trailing = { Text(TOOLS_OVERLAY) },
                        panel = {},
                        socle = { Text(PUBLISH_OVERLAY) },
                        typing = StoryTypingSlot(
                            surface = surface(),
                            bar = { ComposerKeyboardStyleBar(surface = surface(), onOption = onOption, onDone = onDone) },
                            options = { Box(Modifier.fillMaxWidth().height(2000.dp).testTag(OPTIONS)) },
                            onKeyboardRaised = {},
                            keyboard = FixedTypingKeyboard(KEYBOARD),
                        ),
                    )
                }
            }
        }
    }

    private fun bounds(tag: String): DpRect = compose.onNodeWithTag(tag).getUnclippedBoundsInRoot()

    private fun boundsOf(description: String): DpRect = compose.onNodeWithContentDescription(description).getUnclippedBoundsInRoot()

    private fun drawnBounds(tag: String): DpRect {
        val px = compose.onNodeWithTag(tag).fetchSemanticsNode().layoutInfo.coordinates.boundsInRoot()
        val density = compose.density.density
        return DpRect((px.left / density).dp, (px.top / density).dp, (px.right / density).dp, (px.bottom / density).dp)
    }

    private val DpRect.w: Float get() = (right - left).value

    private val DpRect.h: Float get() = (bottom - top).value

    @Test
    fun `while typing the scene shrinks whole and 9 by 16 above the bar, centred, instead of a one centimetre patch`() {
        show()

        val scene = drawnBounds(SCENE)
        val bar = boundsOf(FONT)
        assertThat(scene.bottom.value).isAtMost(bar.top.value + 0.5f)
        assertThat(scene.top.value).isAtLeast(0f)
        assertThat(scene.w / scene.h).isWithin(0.01f).of(9f / 16f)
        assertThat((scene.left + scene.right).value / 2f).isWithin(0.5f).of(180f)
        assertThat(scene.h).isGreaterThan(300f)
    }

    @Test
    fun `the bar sits right on the keyboard`() {
        show()

        assertThat(boundsOf(OK).bottom.value).isWithin(2.5f).of(692f - KEYBOARD)
    }

    @Test
    fun `the bar carries font, colour, alignment, text background and OK, each a 48 dp target`() {
        show()

        listOf(FONT, COLOR, ALIGN, BACKING, OK).forEach { name ->
            compose.onNodeWithContentDescription(name).assertWidthIsAtLeast(48.dp).assertHeightIsAtLeast(48.dp)
        }
    }

    @Test
    fun `the five targets spread evenly across the bar, as in the mockup, rather than huddled left of a far OK`() {
        show()

        val targets = listOf(FONT, COLOR, ALIGN, BACKING, OK).map(::boundsOf)
        val gaps = targets.zipWithNext { left, right -> (right.left - left.right).value }
        gaps.forEach { assertThat(it).isWithin(1f).of(gaps.first()) }
        assertThat(gaps.first()).isGreaterThan(8f)
    }

    @Test
    fun `while typing nothing else is laid on the scene`() {
        show()

        listOf(CLOSE_OVERLAY, TOOLS_OVERLAY, PUBLISH_OVERLAY).forEach { compose.onNodeWithText(it).assertDoesNotExist() }
    }

    @Test
    fun `an icon forwards its choice and OK ends the writing`() {
        val chosen = mutableListOf<Options>()
        var done = 0
        show(onOption = { chosen += it }, onDone = { done++ })

        compose.onNodeWithContentDescription(COLOR).performClick()
        compose.onNodeWithContentDescription(OK).performClick()

        assertThat(chosen).containsExactly(Options.COLOR)
        assertThat(done).isEqualTo(1)
    }

    @Test
    fun `the choices replace the keyboard at its height, and neither the bar nor the scene moves`() {
        var surface by mutableStateOf<Surface>(Surface.Keyboard)
        show(surface = { surface })
        compose.onNodeWithTag(OPTIONS).assertDoesNotExist()
        val barBefore = boundsOf(FONT)
        val sceneBefore = drawnBounds(SCENE)

        surface = Surface.Showing(Options.COLOR)
        compose.waitForIdle()

        val options = bounds(OPTIONS)
        assertThat(options.h).isWithin(0.5f).of(KEYBOARD)
        assertThat(options.bottom.value).isWithin(0.5f).of(692f)
        assertThat(boundsOf(FONT).top.value).isWithin(0.5f).of(barBefore.top.value)
        assertThat(drawnBounds(SCENE)).isEqualTo(sceneBefore)
    }

    @Test
    fun `the open icon is announced as selected`() {
        show(surface = { Surface.Showing(Options.ALIGN) })

        compose.onNodeWithContentDescription(ALIGN).assert(androidx.compose.ui.test.SemanticsMatcher.expectValue(
            androidx.compose.ui.semantics.SemanticsProperties.Selected, true,
        ))
    }

    private companion object {
        const val KEYBOARD = 280f
        const val SCENE = "scene"
        const val OPTIONS = "options"
        const val CLOSE_OVERLAY = "close-overlay"
        const val TOOLS_OVERLAY = "tools-overlay"
        const val PUBLISH_OVERLAY = "publish-overlay"
        const val FONT = "Font"
        const val COLOR = "Color"
        const val ALIGN = "Alignment"
        const val BACKING = "Text background"
        const val OK = "Finish writing"
    }
}

