package me.meeshy.app.feed

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UploadedMedia
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** iOS `ComposerSlideRail` on the document surface: one tile per slide, the bin on the current one only. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostSlideRailTest {
    @get:Rule
    val compose = createComposeRule()

    private val selected = mutableListOf<String>()
    private val removed = mutableListOf<String>()
    private fun photo(id: String) = UploadedMedia(id, "https://cdn/$id.jpg", "image/jpeg", 10L, 100, 100, null, null)

    private fun show(ids: List<String>, current: String?) {
        compose.setContent {
            MeeshyTheme { PostSlideRail(media = ids.map(::photo), currentId = current, onSelect = { selected += it }, onRemove = { removed += it }) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `each media is a tile named by its rank`() {
        show(listOf("a", "b", "c"), current = "b")
        compose.onNodeWithContentDescription("Scene 1 of 3").assertExists()
        compose.onNodeWithContentDescription("Scene 3 of 3").assertExists()
    }

    @Test
    fun `touching a tile selects its media`() {
        show(listOf("a", "b"), current = "a")
        compose.onNodeWithContentDescription("Scene 2 of 2").performClick()
        assertThat(selected).containsExactly("b")
    }

    @Test
    fun `the bin sits on the current tile only and removes that media`() {
        show(listOf("a", "b", "c"), current = "b")
        compose.onAllNodesWithContentDescription("Delete scene 1").assertCountEquals(0)
        compose.onNodeWithContentDescription("Delete scene 2").performClick()
        assertThat(removed).isEmpty()
        compose.onNodeWithText("Delete").performClick()
        assertThat(removed).containsExactly("b")
    }

    @Test
    fun `cancelling the question removes nothing`() {
        show(listOf("a", "b"), current = "a")
        compose.onNodeWithContentDescription("Delete scene 1").performClick()
        compose.onNodeWithText("Delete this scene?").assertExists()
        compose.onNodeWithText("Cancel").performClick()
        assertThat(removed).isEmpty()
    }

    @Test
    fun `the TalkBack action asks before removing too`() {
        show(listOf("a", "b"), current = "a")
        compose.onNodeWithContentDescription("Scene 1 of 2").fetchSemanticsNode().config[SemanticsActions.CustomActions]
            .first { it.label == "Delete scene 1" }.action()
        compose.waitForIdle()
        assertThat(removed).isEmpty()
        compose.onNodeWithText("Delete this scene?").assertExists()
        compose.onNodeWithText("Delete").performClick()
        assertThat(removed).containsExactly("a")
    }

    @Test
    fun `a lone media is shown and can be removed`() {
        show(listOf("a"), current = "a")
        compose.onNodeWithContentDescription("Delete scene 1").performClick()
        compose.onNodeWithText("Delete").performClick()
        assertThat(removed).containsExactly("a")
    }
}
