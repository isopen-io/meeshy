package me.meeshy.app.stories

import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.stories.R
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerDrawingBubblesRobolectricTest {

    @get:Rule
    val compose = createComposeRule()

    private fun text(id: Int): String = ApplicationProvider.getApplicationContext<Context>().getString(id)

    private class Calls {
        val tools = mutableListOf<DrawingEditTool>()
        var undo = 0
        var redo = 0
        var finish = 0
    }

    private fun show(expanded: DrawingEditTool? = null, canUndo: Boolean = true, canRedo: Boolean = true): Calls {
        val calls = Calls()
        compose.setContent {
            MeeshyTheme {
                Box(Modifier.size(420.dp, 120.dp)) {
                    DrawingBubbleRow(
                        expanded = expanded,
                        canUndo = canUndo,
                        canRedo = canRedo,
                        onSelectTool = { calls.tools += it },
                        onUndo = { calls.undo++ },
                        onRedo = { calls.redo++ },
                        onFinish = { calls.finish++ },
                    )
                }
            }
        }
        return calls
    }

    @Test
    fun `the four brush bubbles report which tool they open`() {
        val calls = show()

        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_tool_tool)).performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_tool_color)).performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_tool_thickness)).performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_tool_smoothing)).performClick()

        assertThat(calls.tools).containsExactly(
            DrawingEditTool.TOOL, DrawingEditTool.COLOR, DrawingEditTool.THICKNESS, DrawingEditTool.SMOOTHING,
        ).inOrder()
    }

    @Test
    fun `undo and redo are greyed and inert when unavailable`() {
        val calls = show(canUndo = false, canRedo = false)

        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_undo)).assertIsNotEnabled().performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_redo)).assertIsNotEnabled().performClick()

        assertThat(calls.undo).isEqualTo(0)
        assertThat(calls.redo).isEqualTo(0)
    }

    @Test
    fun `undo and redo fire when available and finish closes the drawing`() {
        val calls = show()

        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_undo)).assertIsEnabled().performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_redo)).performClick()
        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_finish)).performClick()

        assertThat(calls.undo).isEqualTo(1)
        assertThat(calls.redo).isEqualTo(1)
        assertThat(calls.finish).isEqualTo(1)
    }

    @Test
    fun `the expanded tool bubble is announced selected`() {
        show(expanded = DrawingEditTool.COLOR)

        compose.onNodeWithContentDescription(text(R.string.story_drawEdit_tool_color)).assertIsSelected()
    }
}
