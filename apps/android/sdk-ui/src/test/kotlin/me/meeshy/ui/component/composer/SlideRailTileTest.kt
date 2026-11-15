package me.meeshy.ui.component.composer

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.click
import androidx.compose.ui.test.topRight
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SlideRailTileTest {
    @get:Rule
    val compose = createComposeRule()

    private var selects = 0
    private var deletes = 0

    private fun show(isCurrent: Boolean, navigates: Boolean = true, showsBin: Boolean = isCurrent, actions: List<CustomAccessibilityAction> = emptyList()) {
        compose.setContent {
            MeeshyTheme {
                SlideRailTile(
                    position = "Scene 2 of 3",
                    deleteLabel = "Delete scene 2",
                    isCurrent = isCurrent,
                    navigates = navigates,
                    showsBin = showsBin,
                    onSelect = { selects++ },
                    onDelete = { deletes++ },
                    actions = actions,
                ) { Box(androidx.compose.ui.Modifier) }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `the tile is named by its rank and selected when current`() {
        show(isCurrent = true)
        compose.onNodeWithContentDescription("Scene 2 of 3").assertIsSelected()
    }

    @Test
    fun `a tap on another tile selects it`() {
        show(isCurrent = false)
        compose.onNodeWithContentDescription("Scene 2 of 3").performClick()
        assertThat(selects).isEqualTo(1)
    }

    @Test
    fun `a lone tile does not navigate`() {
        show(isCurrent = true, navigates = false)
        compose.onNodeWithContentDescription("Scene 2 of 3").performClick()
        assertThat(selects).isEqualTo(0)
    }

    @Test
    fun `the bin exists only when asked and deletes`() {
        show(isCurrent = false, showsBin = false)
        compose.onAllNodesWithContentDescription("Delete scene 2").assertCountEquals(0)
    }

    @Test
    fun `the bin deletes without selecting`() {
        show(isCurrent = true)
        compose.onNodeWithContentDescription("Delete scene 2").performClick()
        assertThat(deletes).isEqualTo(1)
        assertThat(selects).isEqualTo(0)
    }

    @Test
    fun `a tap on the body of the current tile never deletes it`() {
        show(isCurrent = true)
        compose.onNodeWithContentDescription("Scene 2 of 3").performTouchInput { click(center) }
        assertThat(deletes).isEqualTo(0)
    }

    @Test
    fun `a tap just below the bin on the current tile never deletes it`() {
        show(isCurrent = true)
        compose.onNodeWithContentDescription("Scene 2 of 3").performTouchInput {
            click(Offset(width * 0.75f, height * 0.4f))
        }
        assertThat(deletes).isEqualTo(0)
    }

    @Test
    fun `a tap on the corner of the current tile deletes it`() {
        show(isCurrent = true)
        compose.onNodeWithContentDescription("Scene 2 of 3").performTouchInput {
            click(topRight + Offset(-2f, 2f))
        }
        assertThat(deletes).isEqualTo(1)
    }

    @Test
    fun `the host's TalkBack actions reach the tile node`() {
        var duplicated = 0
        show(isCurrent = true, actions = listOf(CustomAccessibilityAction("Duplicate") { duplicated++; true }))
        val node = compose.onNodeWithContentDescription("Scene 2 of 3").fetchSemanticsNode()
        val actions = node.config[SemanticsActions.CustomActions]
        assertThat(actions.map { it.label }).containsExactly("Duplicate")
        actions.single().action()
        assertThat(duplicated).isEqualTo(1)
    }
}
