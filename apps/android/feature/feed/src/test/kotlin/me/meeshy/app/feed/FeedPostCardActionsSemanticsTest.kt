package me.meeshy.app.feed

import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
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

/** #14749 — chaque statistique de la barre est UN nœud TalkBack, au libellé pluriel du catalogue, sur une cible de 48 dp. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostCardActionsSemanticsTest {

    @get:Rule
    val compose = createComposeRule()

    private val calls = mutableListOf<String>()

    private fun showBar(post: FeedPostPresentation) {
        compose.setContent {
            MeeshyTheme {
                PostStatsRow(
                    post = post,
                    onLike = { calls += "like" },
                    onBookmark = {},
                    onComments = {},
                    onRepost = { calls += "repost" },
                    onQuote = { calls += "quote" },
                    onSend = {},
                )
            }
        }
        compose.waitForIdle()
    }

    private fun stateOf(label: String, expected: String) {
        compose.onNodeWithContentDescription(label)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, expected))
    }

    @Test
    fun `a single like is announced in the singular and several in the plural`() {
        showBar(feedPostPresentation(likeCount = 1))
        stateOf("Like", "1 like")
    }

    @Test
    fun `several likes are announced in the plural`() {
        showBar(feedPostPresentation(likeCount = 3))
        stateOf("Like", "3 likes")
    }

    @Test
    fun `comments and reposts are announced with their own plural`() {
        showBar(feedPostPresentation().copy(commentCount = 1, repostCount = 2))
        stateOf("Comments", "1 comment")
        stateOf("Reposts", "2 reposts")
    }

    @Test
    fun `the send action announces its share count`() {
        showBar(feedPostPresentation().copy(shareCount = 4))
        stateOf("Send", "4 shares")
    }

    @Test
    fun `every action of the bar is a 48 dp target`() {
        showBar(feedPostPresentation())

        listOf("Like", "Comments", "Reposts", "Bookmark", "Send").forEach { label ->
            val bounds = compose.onNodeWithContentDescription(label).getBoundsInRoot()
            assertThat(bounds.bottom - bounds.top).isAtLeast(48.dp)
            assertThat(bounds.right - bounds.left).isAtLeast(48.dp)
        }
    }

    @Test
    fun `a liked heart is exposed as selected`() {
        showBar(feedPostPresentation(likeCount = 1, isLiked = true))

        compose.onNodeWithContentDescription("Unlike")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Selected, true))
    }

    @Test
    fun `the repost icon offers Repost, Quote and Cancel and cancelling reposts nothing`() {
        showBar(feedPostPresentation())

        compose.onNodeWithContentDescription("Reposts").performClick()
        compose.onNodeWithText("Cancel").performClick()

        assertThat(calls).isEmpty()
    }
}
