package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryItem
import me.meeshy.sdk.model.card.PostCommentCardPart
import me.meeshy.sdk.model.card.PostCommentCardSubject
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostImagerMenuComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val imaged = mutableListOf<PostImagerRequest>()
    private val card = PostCommentCardSubject(null, PostCommentCardPart("Awa", "Bonjour", "awa"), emptyList(), 0L, null, emptyList())
    private val scenes = PostImagerRequest(
        key = "post:p1",
        card = card,
        scenes = PostImagerScenes(listOf(StoryItem(id = "p1#scene-0"), StoryItem(id = "p1#scene-1")), accentHex = "6366F1"),
    )
    private val simple = PostImagerRequest(key = "post:p1", card = card)

    private fun show(content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPostCardImager provides { imaged += it }) {
                    Box(Modifier.width(360.dp)) { content() }
                }
            }
        }
        compose.waitForIdle()
    }

    private fun card(post: FeedPostPresentation) = show {
        PostCard(post = post, onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {}, onOpenPost = {}, onOpenReel = {}, onImageTap = {})
    }

    private fun openMenuAndImager() {
        compose.onAllNodesWithContentDescription("Post options")[0].performClick()
        compose.onNodeWithText("Picture it").performClick()
        compose.waitForIdle()
    }

    @Test
    fun `the feed card of a post at scene offers imager, which hands its scenes over`() {
        card(feedPostPresentation().copy(imager = scenes))

        openMenuAndImager()

        assertThat(imaged).containsExactly(scenes)
    }

    @Test
    fun `the feed card of a composed reel offers imager`() {
        val reelScenes = PostImagerRequest("post:reel1", card, PostImagerScenes(listOf(StoryItem(id = "reel1")), accentHex = "FF0000"))
        card(feedPostPresentation(id = "reel1").copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false), imager = reelScenes))

        openMenuAndImager()

        assertThat(imaged).containsExactly(reelScenes)
    }

    @Test
    fun `a post with nothing to image offers no imager entry`() {
        card(feedPostPresentation())

        compose.onAllNodesWithContentDescription("Post options")[0].performClick()

        compose.onNodeWithText("Picture it").assertDoesNotExist()
    }

    @Test
    fun `the detail of a post at scene offers imager from its menu`() {
        show { PostDetailImagerMenu(feedPostPresentation().copy(imager = scenes)) }

        openMenuAndImager()

        assertThat(imaged).containsExactly(scenes)
    }

    @Test
    fun `the detail of a post with nothing to image and of a reel shows no menu of its own`() {
        show {
            PostDetailImagerMenu(feedPostPresentation())
            PostDetailImagerMenu(feedPostPresentation().copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false), imager = scenes))
        }

        compose.onAllNodesWithContentDescription("Post options").assertCountEquals(0)
    }

    @Test
    fun `the menu of a simple post offers imager, which hands its card over`() {
        card(feedPostPresentation().copy(imager = simple))

        openMenuAndImager()

        assertThat(imaged).containsExactly(simple)
    }

    @Test
    fun `the action row of an imageable post carries the wand, a tap opens the card workshop`() {
        card(feedPostPresentation().copy(imager = simple))

        compose.onNodeWithContentDescription("Picture it").performClick()
        compose.waitForIdle()

        assertThat(imaged).containsExactly(simple)
    }

    @Test
    fun `the action row of a post with nothing to image has no wand`() {
        card(feedPostPresentation())

        compose.onNodeWithContentDescription("Picture it").assertDoesNotExist()
    }

    @Test
    fun `the detail action row carries the wand after the bookmark`() {
        show {
            DetailStatsRow(
                post = feedPostPresentation(),
                isReposted = false,
                onRepost = {},
                onQuote = {},
                onLike = {},
                quickEmojis = emptyList(),
                onReact = {},
                onBookmark = {},
                onImager = { imaged += simple },
            )
        }

        compose.onNodeWithContentDescription("Picture it").performClick()
        compose.waitForIdle()

        assertThat(imaged).containsExactly(simple)
    }
}
