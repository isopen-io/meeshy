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
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * #14329 — les trois menus ⋯ d'une oeuvre composée offrent « Imager », qui remet ses scènes à la vue Imager : la carte de post
 * du fil, la carte de réel du fil, le détail d'un post. Une oeuvre sans scène n'offre aucune entrée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostImagerMenuComposeTest {

    @get:Rule
    val compose = createComposeRule()

    private val imaged = mutableListOf<PostImagerScenes>()
    private val scenes = PostImagerScenes(listOf(StoryItem(id = "p1#scene-0"), StoryItem(id = "p1#scene-1")), accentHex = "6366F1")

    private fun show(content: @Composable () -> Unit) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalPostSceneImager provides { imaged += it }) {
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
        card(feedPostPresentation().copy(imagerScenes = scenes))

        openMenuAndImager()

        assertThat(imaged).containsExactly(scenes)
    }

    @Test
    fun `the feed card of a composed reel offers imager`() {
        val reelScenes = PostImagerScenes(listOf(StoryItem(id = "reel1")), accentHex = "FF0000")
        card(feedPostPresentation(id = "reel1").copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false), imagerScenes = reelScenes))

        openMenuAndImager()

        assertThat(imaged).containsExactly(reelScenes)
    }

    @Test
    fun `a post without a composed work offers no imager entry`() {
        card(feedPostPresentation())

        compose.onAllNodesWithContentDescription("Post options")[0].performClick()

        compose.onNodeWithText("Picture it").assertDoesNotExist()
    }

    @Test
    fun `the detail of a post at scene offers imager from its menu`() {
        show { PostDetailImagerMenu(feedPostPresentation().copy(imagerScenes = scenes)) }

        openMenuAndImager()

        assertThat(imaged).containsExactly(scenes)
    }

    @Test
    fun `the detail of a post without scene and of a reel shows no menu of its own`() {
        show {
            PostDetailImagerMenu(feedPostPresentation())
            PostDetailImagerMenu(feedPostPresentation().copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false), imagerScenes = scenes))
        }

        compose.onAllNodesWithContentDescription("Post options").assertCountEquals(0)
    }
}
