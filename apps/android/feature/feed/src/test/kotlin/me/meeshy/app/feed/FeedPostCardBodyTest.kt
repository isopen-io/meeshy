package me.meeshy.app.feed

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FeedPostCardBodyTest {

    @get:Rule
    val compose = createComposeRule()

    private fun show(post: FeedPostPresentation, onHashtag: (String) -> Unit = {}, onProfile: (String) -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                FeedPostCardBody(post = post, onFlagTap = {}, onOpenHashtag = onHashtag, onOpenProfile = onProfile)
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `un texte tres long s abrege puis Voir plus le deplie`() {
        val long = (1..400).joinToString(" ") { "mot$it" }
        show(feedPostPresentation(content = long))

        compose.onNodeWithText("see more").assertExists().performClick()

        compose.onNodeWithText("see less").assertExists()
    }

    @Test
    fun `un texte court n'offre pas Voir plus`() {
        show(feedPostPresentation(content = "court"))

        compose.onAllNodesWithTextCount("see more").let { assertThat(it).isEqualTo(0) }
    }

    @Test
    fun `un post sans texte ne rend rien du corps`() {
        show(feedPostPresentation(content = ""))

        compose.onAllNodesWithTextCount("see more").let { assertThat(it).isEqualTo(0) }
    }

    private fun androidx.compose.ui.test.junit4.ComposeContentTestRule.onAllNodesWithTextCount(text: String): Int =
        onAllNodes(androidx.compose.ui.test.hasText(text)).fetchSemanticsNodes().size
}
