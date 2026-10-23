package me.meeshy.app.feed

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** iOS `CommentMoreMenu`: Copy text for all, Delete for one's own, behind a 44 dp « … ». */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CommentMoreMenuTest {

    @get:Rule
    val compose = createComposeRule()

    private val deleted = mutableListOf<String>()

    private fun comment(isOwn: Boolean) = CommentPresentation(
        id = "c1",
        authorName = "Amina",
        authorAvatarUrl = null,
        createdAtIso = null,
        content = "Bonjour",
        isTranslated = false,
        languageStrip = emptyList(),
        likeCount = 0,
        isLiked = false,
        replyCount = 0,
        parentId = null,
        isReply = false,
        isPending = false,
        isOwn = isOwn,
    )

    private fun show(isOwn: Boolean) {
        compose.setContent { MeeshyTheme { CommentMoreMenu(comment(isOwn), onDelete = { deleted += it }) } }
        compose.waitForIdle()
    }

    @Test
    fun `the more button is a 44 dp target and nothing is deleted on the first touch`() {
        show(isOwn = true)

        val bounds = compose.onNodeWithContentDescription("More options").getBoundsInRoot()
        compose.onNodeWithContentDescription("More options").performClick()

        assertThat(bounds.bottom - bounds.top).isAtLeast(44.dp)
        assertThat(deleted).isEmpty()
        compose.onNodeWithText("Copy text").assertExists()
    }

    @Test
    fun `one's own comment offers Delete, which deletes`() {
        show(isOwn = true)

        compose.onNodeWithContentDescription("More options").performClick()
        compose.onNodeWithText("Delete comment").performClick()

        assertThat(deleted).containsExactly("c1")
    }

    @Test
    fun `someone else's comment offers no Delete`() {
        show(isOwn = false)

        compose.onNodeWithContentDescription("More options").performClick()

        compose.onAllNodesWithText("Delete comment").assertCountEquals(0)
    }
}
