package me.meeshy.app.stories

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.story.StoryCommentComposerState
import me.meeshy.sdk.model.story.StoryCommentReplyTarget
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp")
class StoryCommentComposerBarComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val reply = StoryCommentReplyTarget("c1", "c1", "Alice", "#FF2E63", "Salut toi")

    private fun show(state: StoryCommentComposerState, text: String = "", sent: MutableList<Unit> = mutableListOf(), cancelled: MutableList<Unit> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme(darkTheme = true) {
                StoryCommentComposerBar(state = state, text = text, onTextChange = {}, onSend = { sent += Unit }, onCancelReply = { cancelled += Unit })
            }
        }
    }

    @Test
    fun `no banner on a top level comment`() {
        show(StoryCommentComposerState("#6366F1"))
        compose.onNodeWithTag(STORY_COMMENT_FIELD_TAG).assertIsDisplayed()
        compose.onAllNodesWithTagCount(STORY_COMMENT_REPLY_BANNER_TAG).let { assertThat(it).isEqualTo(0) }
    }

    @Test
    fun `replying shows the banner and its cross cancels the reply`() {
        val cancelled = mutableListOf<Unit>()
        show(StoryCommentComposerState("#6366F1", reply), cancelled = cancelled)
        compose.onNodeWithTag(STORY_COMMENT_REPLY_BANNER_TAG).assertIsDisplayed()
        compose.onNodeWithTag(STORY_COMMENT_REPLY_CANCEL_TAG).performClick()
        assertThat(cancelled).hasSize(1)
    }

    @Test
    fun `send fires only with a text`() {
        val empty = mutableListOf<Unit>()
        show(StoryCommentComposerState("#6366F1"), text = "", sent = empty)
        compose.onNodeWithTag(STORY_COMMENT_SEND_TAG).performClick()
        assertThat(empty).isEmpty()
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTagCount(tag: String): Int =
        onAllNodes(androidx.compose.ui.test.hasTestTag(tag)).fetchSemanticsNodes().size
}
