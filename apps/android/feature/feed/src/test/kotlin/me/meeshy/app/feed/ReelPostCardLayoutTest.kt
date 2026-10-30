package me.meeshy.app.feed

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.StoryItem
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import androidx.compose.ui.unit.width
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13681 — la carte d'un réel : la couverture recouvre toute la carte, la légende se pose en bas, par-dessus (iOS `ReelFeedCard`). */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelPostCardLayoutTest {

    @get:Rule
    val compose = createComposeRule()

    private val reel = feedPostPresentation(id = "reel1", content = "Ma légende").copy(
        isReel = true,
        reelCover = ReelCover.Backdrop(isVideo = false),
    )

    private fun showFeedCard(post: FeedPostPresentation, opened: MutableList<String> = mutableListOf()) {
        compose.setContent {
            MeeshyTheme {
              Box(Modifier.width(240.dp)) {
                PostCard(
                    post = post, onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {}, onOpenPost = {},
                    onOpenReel = { opened += it }, onImageTap = {},
                )
              }
            }
        }
    }

    @Test
    fun `la carte d un reel du fil est une carte plein cadre`() {
        showFeedCard(reel)
        compose.onNodeWithTag(REEL_CARD_TAG).assertIsDisplayed()
    }

    @Test
    fun `la couverture recouvre toute la carte`() {
        showFeedCard(reel)
        val card = compose.onNodeWithTag(REEL_CARD_TAG).getBoundsInRoot()
        val cover = compose.onNodeWithTag(REEL_CARD_COVER_TAG).getBoundsInRoot()
        assertThat(cover.left).isEqualTo(card.left)
        assertThat(cover.top).isEqualTo(card.top)
        assertThat(cover.right).isEqualTo(card.right)
        assertThat(cover.bottom).isEqualTo(card.bottom)
    }

    @Test
    fun `la legende est en surimpression, dans la moitie basse de la carte`() {
        showFeedCard(reel)
        val card = compose.onNodeWithTag(REEL_CARD_TAG).getBoundsInRoot()
        val caption = compose.onNodeWithTag(REEL_CARD_CAPTION_TAG).getBoundsInRoot()
        val overlay = compose.onNodeWithTag(REEL_CARD_OVERLAY_TAG).getBoundsInRoot()
        compose.onNodeWithText("Ma légende").assertIsDisplayed()
        assertThat(caption.top).isAtLeast(card.top + (card.bottom - card.top) / 2)
        assertThat(caption.bottom).isAtMost(card.bottom)
        assertThat(overlay.bottom).isEqualTo(card.bottom)
        assertThat(overlay.top).isAtLeast(card.top)
    }

    @Test
    fun `un appui sur la couverture ouvre ce reel`() {
        val opened = mutableListOf<String>()
        showFeedCard(reel, opened)
        compose.onNodeWithContentDescription("Reel by Amina").performClick()
        assertThat(opened).containsExactly("reel1")
    }

    @Test
    fun `un reel republie est signe de son auteur d origine et ouvre le reel cite`() {
        val quoted = RepostEmbedPresentation(
            id = "orig", authorName = "Origen", authorAvatarUrl = null, createdAtIso = null, content = "",
            isTranslated = false, previewImageUrl = null, extraMediaCount = 0, likeCount = 0, moodEmoji = null,
            isQuote = false, isStory = false, isReel = true, reelCover = ReelCover.Backdrop(isVideo = false),
        )
        val opened = mutableListOf<String>()
        showFeedCard(reel.copy(id = "outer", repostEmbed = quoted), opened)
        compose.onNodeWithText("Origen").assertIsDisplayed()
        compose.onNodeWithText("Reposted by Amina").assertIsDisplayed()
        compose.onNodeWithContentDescription("Reel by Origen").performClick()
        assertThat(opened).containsExactly("orig")
    }

    @Test
    fun `la scene d un reel compose remplit toute la carte comme iOS, au rapport 4 5`() {
        val composed = reel.copy(reelCover = ReelCover.Scene(StoryItem(id = "reel1")))
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReelSceneRenderer provides { _, _, _, modifier -> Box(modifier.testTag("scene")) }) {
                    Box(Modifier.width(240.dp)) {
                        PostCard(
                            post = composed, onLike = {}, onBookmark = {}, onFlagTap = {}, onClick = {}, onOpenPost = {},
                            onOpenReel = {}, onImageTap = {},
                        )
                    }
                }
            }
        }
        val card = compose.onNodeWithTag(REEL_CARD_TAG).getBoundsInRoot()
        val scene = compose.onNodeWithTag("scene", useUnmergedTree = true).getBoundsInRoot()
        assertThat(card.height.value / card.width.value).isWithin(0.001f).of(1.25f)
        assertThat(scene.left).isEqualTo(card.left)
        assertThat(scene.top).isEqualTo(card.top)
        assertThat(scene.width).isEqualTo(card.width)
        assertThat(scene.height).isEqualTo(card.height)
    }
}
