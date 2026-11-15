package me.meeshy.app.feed

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * La garde de #13244 (iOS `FeedPostCardLikeWiringSourceGuardTests`, #15934) : une carte n'affiche une action que si son
 * hôte lui en passe l'effet. Un hôte qui oublie un geste le voit disparaître de la carte — jamais un bouton qui ne fait rien.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostCardInertActionGuardTest {

    @get:Rule
    val compose = createComposeRule()

    private val reel = feedPostPresentation(id = "r1").copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false))

    @Test
    fun `un reel monte sans geste n affiche ni coeur, ni bulle, ni enregistrement, ni menu`() {
        compose.setContent { MeeshyTheme { ReelPostCard(post = reel, cover = ReelCover.Backdrop(isVideo = false), onOpenReel = {}) } }

        listOf("Like", "Comments", "Bookmark", "Reposts", "Send", "Post options").forEach { label ->
            compose.onNodeWithContentDescription(label).assertDoesNotExist()
        }
    }

    @Test
    fun `le menu d un post n offre que les gestes que son hote a branches`() {
        compose.setContent {
            MeeshyTheme {
                PostCard(
                    post = feedPostPresentation(),
                    onLike = {},
                    onBookmark = {},
                    onFlagTap = {},
                    onClick = {},
                    onOpenPost = {},
                    onImageTap = {},
                )
            }
        }

        compose.onNodeWithContentDescription("Post options").performClick()

        listOf("Share", "Copy link", "Copy text", "Report", "Repost", "Quote").forEach { label ->
            compose.onNodeWithText(label).assertDoesNotExist()
        }
        compose.onNodeWithText("Save").assertExists()
    }
}
