package me.meeshy.ui.component.comments

import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.material3.Text
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.CommentPieceKind
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentAttachmentsTraySemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val labels = CommentTrayLabels(edit = "Edit", remove = "Remove", preparing = "Preparing")
    private fun tile(id: String, loading: Boolean = false) = CommentTrayTile(id, CommentPieceKind.IMAGE, "$id.jpg", loading)

    private fun show(tiles: List<CommentTrayTile>, edited: MutableList<String> = mutableListOf(), removed: MutableList<String> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
                CommentAttachmentsTray(tiles, labels, onEdit = { edited += it.id }, onRemove = { removed += it }) { Text(it.name) }
            }
        }
    }

    @Test
    fun `chaque tuile dit Editer et porte son retrait`() {
        show(listOf(tile("a"), tile("b")))
        compose.onAllNodesWithContentDescription("Edit").assertCountEquals(2)
        compose.onAllNodesWithContentDescription("Remove").assertCountEquals(2)
    }

    @Test
    fun `toucher la tuile l edite et la croix la retire`() {
        val edited = mutableListOf<String>()
        val removed = mutableListOf<String>()
        show(listOf(tile("a")), edited, removed)
        compose.onNodeWithContentDescription("Edit").performClick()
        compose.onNodeWithContentDescription("Remove").performClick()
        assertThat(edited).containsExactly("a")
        assertThat(removed).containsExactly("a")
    }

    @Test
    fun `une piece en lecture le dit a TalkBack`() {
        show(listOf(tile("a", loading = true)))
        compose.onNodeWithContentDescription("Edit")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Preparing"))
    }

    @Test
    fun `une zone vide ne pose rien`() {
        show(emptyList())
        compose.onAllNodesWithText("a.jpg").assertCountEquals(0)
    }
}
