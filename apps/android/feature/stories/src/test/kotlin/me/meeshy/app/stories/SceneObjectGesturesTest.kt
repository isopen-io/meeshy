package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
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
 * #14207 — trois gestes sur un objet de la scène, qui ne se chevauchent jamais : toucher sélectionne, toucher-déplacer
 * déplace (au-delà de la tolérance, aucun appui long ne part plus), l'appui long immobile ouvre le menu. Et la sélection
 * ne dessine aucun cadre.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SceneObjectGesturesTest {

    @get:Rule
    val compose = createComposeRule()

    private class Seen {
        var taps = 0
        var longPresses = 0
        var dx = 0f
        var dy = 0f
        var ends = 0
        var slop = 0f
    }

    private fun sticker(scale: Float = 1f): Seen {
        val seen = Seen()
        compose.setContent {
            seen.slop = androidx.compose.ui.platform.LocalViewConfiguration.current.touchSlop
            MeeshyTheme {
                Box(Modifier.size(300.dp, 400.dp).testTag("canvas")) {
                    StickerLayer(
                        sticker = StoryStickerElement(id = "s", emoji = "🙂", scale = scale),
                        selected = false,
                        menu = null,
                        canvasWidthPx = 300f,
                        canvasHeightPx = 400f,
                        onTap = { seen.taps++ },
                        onLongPress = { seen.longPresses++ },
                        onMenuAction = {},
                        onMenuDismiss = {},
                        onDrag = { x, y -> seen.dx += x; seen.dy += y },
                        onDragEnd = { seen.ends++ },
                        onTransform = { _, _ -> },
                    )
                }
            }
        }
        return seen
    }

    private fun text(): Seen {
        val seen = Seen()
        compose.setContent {
            seen.slop = androidx.compose.ui.platform.LocalViewConfiguration.current.touchSlop
            MeeshyTheme {
                Box(Modifier.size(300.dp, 400.dp).testTag("canvas")) {
                    TextElementLayer(
                        element = StoryTextElement(id = "t", text = "Bonjour"),
                        selected = false,
                        menu = null,
                        canvasWidthPx = 300f,
                        canvasHeightPx = 400f,
                        onTap = { seen.taps++ },
                        onLongPress = { seen.longPresses++ },
                        onMenuAction = {},
                        onMenuDismiss = {},
                        onDrag = { x, y -> seen.dx += x; seen.dy += y },
                        onDragEnd = { seen.ends++ },
                        onTransform = { _, _ -> },
                    )
                }
            }
        }
        return seen
    }

    /** Un glissé qui démarre lentement : 0,4 tolérance toutes les 100 ms, la tolérance est franchie avant l'appui long. */
    private fun slowDrag(seen: Seen) {
        compose.onNodeWithTag("canvas").performTouchInput {
            down(Offset(150f, 200f))
            repeat(10) { moveBy(Offset(seen.slop * 0.4f, 0f), delayMillis = 100) }
            up()
        }
    }

    @Test
    fun `a touch selects the object and opens no menu`() {
        val seen = sticker()
        compose.onNodeWithTag("canvas").performTouchInput { down(Offset(150f, 200f)); up() }

        assertThat(seen.taps).isEqualTo(1)
        assertThat(seen.longPresses).isEqualTo(0)
    }

    @Test
    fun `a long press without moving opens the menu and selects nothing else`() {
        val seen = sticker()
        compose.onNodeWithTag("canvas").performTouchInput { longClick(Offset(150f, 200f)) }

        assertThat(seen.longPresses).isEqualTo(1)
        assertThat(seen.taps).isEqualTo(0)
        assertThat(seen.dx).isEqualTo(0f)
    }

    @Test
    fun `a touch then move never opens the menu, however slowly it starts`() {
        val seen = sticker()
        slowDrag(seen)

        assertThat(seen.longPresses).isEqualTo(0)
        assertThat(seen.taps).isEqualTo(0)
        assertThat(seen.dx).isGreaterThan(0f)
    }

    @Test
    fun `on an enlarged sticker the tolerance is the one of the screen, so a slow move still never opens the menu`() {
        val seen = sticker(scale = 3f)
        slowDrag(seen)

        assertThat(seen.longPresses).isEqualTo(0)
        assertThat(seen.dx).isGreaterThan(0f)
    }

    @Test
    fun `a moved object that then rests under the finger opens no menu`() {
        val seen = sticker()
        compose.onNodeWithTag("canvas").performTouchInput {
            down(Offset(150f, 200f))
            moveBy(Offset(40f, 0f))
            advanceEventTime(1_500)
            moveBy(Offset(0f, 0f))
            up()
        }

        assertThat(seen.longPresses).isEqualTo(0)
        assertThat(seen.ends).isEqualTo(1)
    }

    @Test
    fun `an enlarged sticker follows the finger by the distance it travelled`() {
        val seen = sticker(scale = 2f)
        compose.onNodeWithTag("canvas").performTouchInput {
            down(Offset(150f, 200f))
            moveBy(Offset(20f, 0f))
            moveBy(Offset(80f, 0f))
            up()
        }

        assertThat(seen.dx).isWithin(1f).of(100f)
    }

    @Test
    fun `a text touched then moved slowly never opens its menu`() {
        val seen = text()
        slowDrag(seen)

        assertThat(seen.longPresses).isEqualTo(0)
        assertThat(seen.dx).isGreaterThan(0f)
    }

    @Test
    fun `a text held still opens its menu`() {
        val seen = text()
        compose.onNodeWithTag("canvas").performTouchInput { longClick(Offset(150f, 200f)) }

        assertThat(seen.longPresses).isEqualTo(1)
        assertThat(seen.taps).isEqualTo(0)
    }

    @Test
    fun `a selected object draws no frame, it is only said selected`() {
        compose.setContent {
            Box(Modifier.size(20.dp).sceneSelection(true).testTag("object"))
        }
        val node = compose.onNodeWithTag("object").fetchSemanticsNode()
        val drawn = node.layoutInfo.getModifierInfo().map { it.modifier.javaClass.simpleName }.filter { "Draw" in it || "Border" in it }

        assertThat(drawn).isEmpty()
        assertThat(node.config[SemanticsProperties.Selected]).isTrue()
    }
}
