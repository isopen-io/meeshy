package me.meeshy.app.stories

import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * #13636 — « Mettre sur la scène » est un interrupteur que TalkBack annonce comme tel, avec son état, et chaque action de
 * la vignette est une cible de 48 dp qui ne chevauche pas sa voisine.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerMediaTileAccessibilityTest {

    @get:Rule
    val compose = createComposeRule()

    private val density = RuntimeEnvironment.getApplication().resources.displayMetrics.density

    private fun show(isPlaced: Boolean, onTogglePlaced: () -> Unit = {}, isBackground: Boolean = false) {
        compose.setContent {
            MeeshyTheme {
                MediaThumbnail(
                    model = null,
                    isPending = false,
                    onRemove = {},
                    isBackground = isBackground,
                    onToggleBackground = {},
                    isPlaced = isPlaced,
                    onTogglePlaced = if (isBackground) null else onTogglePlaced,
                )
            }
        }
    }

    private val placeLabel = "Place on the scene"

    @Test
    fun `the placing control is a switch that says whether the media is on the scene`() {
        show(isPlaced = false)
        compose.onNodeWithContentDescription(placeLabel)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Switch))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, ToggleableState.Off))
    }

    @Test
    fun `once placed it keeps its name and reads on`() {
        show(isPlaced = true)
        compose.onNodeWithContentDescription(placeLabel)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.ToggleableState, ToggleableState.On))
    }

    @Test
    fun `placed, its double tap announces taking the media off the scene`() {
        show(isPlaced = true)
        val action = compose.onNodeWithContentDescription(placeLabel).fetchSemanticsNode().config[SemanticsActions.OnClick]

        assertThat(action.label).isEqualTo("Remove from scene")
    }

    @Test
    fun `a tap toggles the placing`() {
        var toggled = 0
        show(isPlaced = false, onTogglePlaced = { toggled++ })

        compose.onNodeWithContentDescription(placeLabel).performClick()

        assertThat(toggled).isEqualTo(1)
    }

    private fun bounds(description: String): Rect =
        compose.onNodeWithContentDescription(description).fetchSemanticsNode().touchBoundsInRoot

    @Test
    fun `every action of the tile is at least 48 dp wide and high`() {
        show(isPlaced = false)

        listOf(placeLabel, "Remove", "Set as background").forEach { label ->
            val rect = bounds(label)
            assertThat(rect.width / density).isAtLeast(48f)
            assertThat(rect.height / density).isAtLeast(48f)
        }
    }

    @Test
    fun `the actions of the tile never share a touch zone`() {
        show(isPlaced = false)

        val zones = listOf(placeLabel, "Remove", "Set as background").map(::bounds)

        zones.forEachIndexed { index, a ->
            zones.drop(index + 1).forEach { b ->
                val overlap = a.intersect(b)
                assertThat(overlap.width.coerceAtLeast(0f) * overlap.height.coerceAtLeast(0f)).isEqualTo(0f)
            }
        }
    }

    @Test
    fun `the background action keeps its reading when the media is the background`() {
        show(isPlaced = false, isBackground = true)

        compose.onNode(hasContentDescription("Clear background")).assertExists()
    }
}
