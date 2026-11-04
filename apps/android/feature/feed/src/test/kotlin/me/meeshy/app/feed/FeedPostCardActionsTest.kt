package me.meeshy.app.feed

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasAnyAncestor
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** iOS `FeedPostActionsBar`: the comment bubble opens the comments, repost offers Repost / Quote through `RepostChoiceDialog` (#12234). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostCardActionsTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun showCard(canRepost: Boolean = true, canQuote: Boolean = true) {
        compose.setContent {
            MeeshyTheme {
                PostCard(
                    post = feedPostPresentation(),
                    onLike = { calls += "like" },
                    onBookmark = { calls += "bookmark" },
                    onFlagTap = {},
                    onClick = { calls += "card" },
                    onOpenPost = {},
                    onImageTap = {},
                    onComments = { calls += "comments" },
                    onRepost = if (canRepost) { -> calls += "repost" } else null,
                    onQuote = if (canQuote) { -> calls += "quote" } else null,
                )
            }
        }
        compose.waitForIdle()
    }

    private fun choice(label: String) =
        compose.onNode(hasText(label) and hasClickAction() and hasAnyAncestor(hasTestTag(REPOST_CHOICE_DIALOG_TAG)))

    @Test
    fun `touching the comment bubble opens the comments`() {
        showCard()

        compose.onNodeWithContentDescription("Comments").performClick()

        assertThat(calls).containsExactly("comments")
    }

    @Test
    fun `touching repost offers Repost then reposts`() {
        showCard()

        compose.onNodeWithContentDescription("Reposts").performClick()
        choice("Repost").performClick()

        assertThat(calls).containsExactly("repost")
    }

    @Test
    fun `touching repost offers Quote too`() {
        showCard()

        compose.onNodeWithContentDescription("Reposts").performClick()
        choice("Quote").performClick()

        assertThat(calls).containsExactly("quote")
    }

    @Test
    fun `the choice is the one Repost dialog, titled Repost, with Cancel`() {
        showCard()

        compose.onNodeWithContentDescription("Reposts").performClick()

        compose.onNodeWithTag(REPOST_CHOICE_DIALOG_TAG).assertExists()
        choice("Cancel").performClick()
        compose.onNodeWithTag(REPOST_CHOICE_DIALOG_TAG).assertDoesNotExist()
        assertThat(calls).isEmpty()
    }

    @Test
    fun `a surface without a quote door offers Repost only`() {
        showCard(canQuote = false)

        compose.onNodeWithContentDescription("Reposts").performClick()

        choice("Repost").assertExists()
        choice("Quote").assertDoesNotExist()
    }

    @Test
    fun `a surface with no repost writer draws no repost button at all`() {
        showCard(canRepost = false, canQuote = false)

        compose.onAllNodesWithContentDescription("Reposts").assertCountEquals(0)
    }

    @Test
    fun `every action of the bar is a 44 dp target`() {
        showCard()

        listOf("Like", "Comments", "Reposts", "Bookmark").forEach { label ->
            val bounds = compose.onNodeWithContentDescription(label).getBoundsInRoot()
            assertThat(bounds.bottom - bounds.top).isAtLeast(44.dp)
            assertThat(bounds.right - bounds.left).isAtLeast(44.dp)
        }
    }
}
