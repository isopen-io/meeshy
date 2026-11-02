package me.meeshy.app.feed

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
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

/** iOS `FeedPostActionsBar`: the comment bubble opens the comments, repost offers Repost / Quote. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostCardActionsTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun showCard() {
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
                    onRepost = { calls += "repost" },
                    onQuote = { calls += "quote" },
                )
            }
        }
        compose.waitForIdle()
    }

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
        compose.onNodeWithText("Repost").performClick()

        assertThat(calls).containsExactly("repost")
    }

    @Test
    fun `touching repost offers Quote too`() {
        showCard()

        compose.onNodeWithContentDescription("Reposts").performClick()
        compose.onNodeWithText("Quote").performClick()

        assertThat(calls).containsExactly("quote")
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
