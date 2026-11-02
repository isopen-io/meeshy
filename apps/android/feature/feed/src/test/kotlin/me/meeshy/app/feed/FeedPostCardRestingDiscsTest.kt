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

/** #13671 — comme iOS, une carte du fil garde sa disposition sous les disques flottants : en-tête et actions ne s'écartent pas (360 dp). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h740dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class FeedPostCardRestingDiscsTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `le menu d'options reste au bord de la carte, sous le disque`() {
        compose.setContentBesideRestingDiscs {
            PostCard(
                post = feedPostPresentation(),
                onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {}, onOpenPost = {}, onImageTap = {},
            )
        }
        val (_, rightDisc) = compose.restingDiscBounds()
        val options = compose.onNodeWithContentDescription("Post options").getBoundsInRoot()
        assertThat(options.sharesHeightWith(rightDisc)).isTrue()
        assertThat(options.right.value).isGreaterThan(rightDisc.left.value)
    }

    @Test
    fun `la rangee d'actions commence a la marge, sous le disque`() {
        compose.setContentBesideRestingDiscs {
            FeedPostCardFooter(
                post = feedPostPresentation(),
                onLike = {}, onBookmark = {}, onComments = {}, onRepost = {}, onQuote = {},
            )
        }
        val (leftDisc, _) = compose.restingDiscBounds()
        val like = compose.onNodeWithContentDescription("Like").getBoundsInRoot()
        assertThat(like.sharesHeightWith(leftDisc)).isTrue()
        assertThat(like.left.value).isLessThan(leftDisc.right.value)
    }
}
