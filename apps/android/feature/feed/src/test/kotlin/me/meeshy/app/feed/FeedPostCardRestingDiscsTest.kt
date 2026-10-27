package me.meeshy.app.feed

import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** #12497 — au repos, le menu d'options et les actions d'une carte du fil restent entre les deux disques flottants (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FeedPostCardRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `au repos le menu d'options et l'action aimer ne passent pas sous un disque`() {
        compose.setContentBesideRestingDiscs {
            PostCard(
                post = feedPostPresentation(),
                onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {}, onOpenPost = {}, onImageTap = {},
            )
        }
        val options = compose.onNodeWithContentDescription("Post options").getBoundsInRoot()
        assertThat(options.right.value).isAtMost(RestingDiscs.trailingEdge)
    }

    @Test
    fun `au repos la rangee d'actions cede la place des deux disques`() {
        compose.setContentBesideRestingDiscs {
            FeedPostCardFooter(
                post = feedPostPresentation(),
                onLike = {}, onBookmark = {}, onComments = {}, onRepost = {}, onQuote = {},
            )
        }
        val comments = compose.onNodeWithContentDescription("Comments").getBoundsInRoot()
        assertThat(comments.left.value).isAtLeast(RestingDiscs.leadingEdge)
    }
}
