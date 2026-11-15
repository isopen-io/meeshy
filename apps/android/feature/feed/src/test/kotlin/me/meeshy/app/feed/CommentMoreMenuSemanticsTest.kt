package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MessageEffectFlags
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Le menu « … » d'un commentaire et ses actions personnalisées TalkBack sont UNE seule liste, dictée par la loi. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentMoreMenuSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val edited = mutableListOf<String>()
    private val reported = mutableListOf<String>()

    private fun comment(isOwn: Boolean, flags: Int? = null) = CommentPresentation(
        id = "c1", authorName = "Amina", authorAvatarUrl = null, createdAtIso = null, content = "Bonjour",
        isTranslated = false, languageStrip = emptyList(), likeCount = 0, isLiked = false, replyCount = 0,
        parentId = null, isReply = false, isPending = false, isOwn = isOwn, authorId = "u-amina", effectFlags = flags,
    )

    private fun host(role: String? = "USER", closed: Boolean = false) = CommentMenuHost(
        viewerId = "u-me",
        viewerRole = role,
        onEdit = { edited += it },
        onRequestReport = { reported += it },
        onRequestRemove = {},
        commentsClosed = closed,
    )

    @Composable
    private fun Row(comment: CommentPresentation) {
        val entries = rememberCommentMenuEntries(comment, onDelete = {}, imaging = null)
        Box(Modifier.testTag("row").commentMenuCustomActions(entries))
    }

    private fun show(comment: CommentPresentation, host: CommentMenuHost) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalCommentMenuHost provides host) {
                    Row(comment)
                    CommentMoreMenu(comment, onDelete = {})
                }
            }
        }
        compose.waitForIdle()
    }

    private fun customLabels(): List<String> =
        compose.onNodeWithTag("row").fetchSemanticsNode().config[SemanticsActions.CustomActions].map { it.label }

    @Test
    fun `the author gets copy, edit and delete as TalkBack actions`() {
        show(comment(isOwn = true), host())
        assertThat(customLabels()).containsExactly("Copy text", "Edit", "Delete comment").inOrder()
    }

    @Test
    fun `on a closed thread the author keeps copy and delete but no longer edits`() {
        show(comment(isOwn = true), host(closed = true))
        assertThat(customLabels()).containsExactly("Copy text", "Delete comment").inOrder()
    }

    @Test
    fun `on a closed thread another reader still reports`() {
        show(comment(isOwn = false), host(closed = true))
        assertThat(customLabels()).containsExactly("Copy text", "Report").inOrder()
    }

    @Test
    fun `another reader gets copy and report`() {
        show(comment(isOwn = false), host())
        assertThat(customLabels()).containsExactly("Copy text", "Report").inOrder()
    }

    @Test
    fun `moderation also gets remove`() {
        show(comment(isOwn = false), host(role = "MODERATOR"))
        assertThat(customLabels()).containsExactly("Copy text", "Report", "Remove").inOrder()
    }

    @Test
    fun `a protected comment is never copyable`() {
        show(comment(isOwn = false, flags = MessageEffectFlags.VIEW_ONCE.toInt()), host())
        assertThat(customLabels()).containsExactly("Report")
    }

    @Test
    fun `the menu entry runs the host gesture`() {
        show(comment(isOwn = true), host())
        compose.onNodeWithContentDescription("More options").performClick()
        compose.onNodeWithText("Edit").performClick()
        assertThat(edited).containsExactly("c1")
    }

    @Test
    fun `report asks the host`() {
        show(comment(isOwn = false), host())
        compose.onNodeWithContentDescription("More options").performClick()
        compose.onNodeWithText("Report").performClick()
        assertThat(reported).containsExactly("c1")
    }
}
