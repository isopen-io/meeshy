package me.meeshy.ui.component.composer

import androidx.compose.foundation.layout.Box
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.semantics.SemanticsActions
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SlideDeletionConfirmationTest {
    @get:Rule
    val compose = createComposeRule()

    private val deleted = mutableListOf<String>()

    private fun show() {
        compose.setContent {
            MeeshyTheme {
                val request = rememberConfirmedSlideDeletion { deleted += it }
                SlideRailTile(
                    position = "Scene 1 of 2",
                    deleteLabel = "Delete scene 1",
                    isCurrent = true,
                    navigates = true,
                    showsBin = true,
                    onSelect = {},
                    onDelete = { request("a") },
                    actions = listOf(CustomAccessibilityAction("Delete scene 1 by action") { request("a"); true }),
                ) { Box(androidx.compose.ui.Modifier) }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `nothing is asked until a deletion is requested`() {
        show()
        compose.onAllNodesWithText("Delete this scene?").assertCountEquals(0)
    }

    @Test
    fun `the bin asks first and deletes nothing yet`() {
        show()
        compose.onNodeWithContentDescription("Delete scene 1").performClick()
        compose.onNodeWithText("Delete this scene?").assertExists()
        assertThat(deleted).isEmpty()
    }

    @Test
    fun `cancelling changes nothing and closes the question`() {
        show()
        compose.onNodeWithContentDescription("Delete scene 1").performClick()
        compose.onNodeWithText("Cancel").performClick()
        compose.onAllNodesWithText("Delete this scene?").assertCountEquals(0)
        assertThat(deleted).isEmpty()
    }

    @Test
    fun `confirming deletes the requested scene once`() {
        show()
        compose.onNodeWithContentDescription("Delete scene 1").performClick()
        compose.onNodeWithText("Delete").performClick()
        compose.onAllNodesWithText("Delete this scene?").assertCountEquals(0)
        assertThat(deleted).containsExactly("a")
    }

    @Test
    fun `the TalkBack action asks first too`() {
        show()
        compose.onNodeWithContentDescription("Scene 1 of 2").fetchSemanticsNode().config[SemanticsActions.CustomActions]
            .first { it.label == "Delete scene 1 by action" }.action()
        compose.waitForIdle()
        compose.onNodeWithText("Delete this scene?").assertExists()
        assertThat(deleted).isEmpty()
        compose.onNodeWithText("Delete").performClick()
        assertThat(deleted).containsExactly("a")
    }
}
