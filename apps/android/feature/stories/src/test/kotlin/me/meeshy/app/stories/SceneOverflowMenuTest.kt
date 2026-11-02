package me.meeshy.app.stories

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.PopupPositionProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #14347 — le menu « … » du plein écran d'un post à scène reste dans l'écran d'un Galaxy S8 (411 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "en-w411dp-h846dp-xxhdpi")
class SceneOverflowMenuTest {

    @get:Rule
    val compose = createComposeRule()

    private val position = EndAnchoredMenuPosition(gapPx = 12)
    private val menu = IntSize(735, 400)
    private val anchor = IntRect(left = 1000, top = 60, right = 1108, bottom = 168)

    @Test
    fun `the menu ends on the button's end edge even when the full screen window claims more width than the screen`() {
        listOf(IntSize(1233, 2538), IntSize(1640, 2538)).forEach { window ->
            val at = position.calculatePosition(anchor, window, LayoutDirection.Ltr, menu)

            assertThat(at).isEqualTo(IntOffset(anchor.right - menu.width, anchor.bottom + 12))
        }
    }

    @Test
    fun `the menu opens above the button when the space below is missing, and never leaves the left edge`() {
        val low = IntRect(left = 40, top = 2300, right = 148, bottom = 2408)

        val at = position.calculatePosition(low, IntSize(1233, 2538), LayoutDirection.Ltr, menu)

        assertThat(at).isEqualTo(IntOffset(0, low.top - 12 - menu.height))
    }

    @Test
    fun `in a right to left layout the menu starts on the button's left edge, inside the window`() {
        val start = IntRect(left = 24, top = 60, right = 132, bottom = 168)

        assertThat(position.calculatePosition(start, IntSize(1233, 2538), LayoutDirection.Rtl, menu).x).isEqualTo(24)
    }

    /** Le placement que la vraie fenêtre de menu demande : bornes du bouton, taille de la fenêtre et du menu, position rendue. */
    private class Recording(gapPx: Int) : PopupPositionProvider {
        private val placed = EndAnchoredMenuPosition(gapPx)
        var last: Pair<IntOffset, IntSize>? = null
        override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset =
            placed.calculatePosition(anchorBounds, windowSize, layoutDirection, popupContentSize).also { last = it to popupContentSize }
    }

    @Test
    fun `on a 411 dp screen the menu of the top end button opens inside the screen, against the button, with its three exits`() {
        var recording: Recording? = null
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.fillMaxSize()) {
                    Box(Modifier.align(Alignment.TopEnd).padding(8.dp).size(44.dp)) {
                        SceneOverflowMenu(expanded = true, onDismissRequest = {}, position = { gap -> Recording(gap).also { recording = it } }) {
                            StoryVideoExportMenuEntries(onPick = {})
                        }
                    }
                }
            }
        }
        compose.waitForIdle()

        listOf("Save video", "Share video", "Picture it").forEach { compose.onNodeWithText(it).assertExists() }
        val (at, size) = requireNotNull(recording?.last)
        val screenWidthPx = with(compose.density) { 411.dp.roundToPx() }
        val buttonEndPx = screenWidthPx - with(compose.density) { 8.dp.roundToPx() }
        assertThat(at.x).isAtLeast(0)
        assertThat(at.x + size.width).isEqualTo(buttonEndPx)
    }
}
