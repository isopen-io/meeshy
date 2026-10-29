package me.meeshy.app.feed

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** #13666 — Enregistrés, Publications d'un utilisateur, Proximité et Détail du post rendent la couverture du fil et ouvrent CE réel. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ReelCoverScreensTest {

    @get:Rule
    val compose = createComposeRule()

    private val reel = feedPostPresentation(id = "reel1").copy(
        isReel = true,
        reelCover = ReelCover.Backdrop(isVideo = false),
    )

    private fun quotedReel(id: String) = RepostEmbedPresentation(
        id = id, authorName = "Origen", authorAvatarUrl = null, createdAtIso = null, content = "",
        isTranslated = false, previewImageUrl = null, extraMediaCount = 0, likeCount = 0, moodEmoji = null,
        isQuote = false, isStory = false, isReel = true, reelCover = ReelCover.Backdrop(isVideo = false),
    )

    private val republished = feedPostPresentation(id = "outer").copy(isReel = true, reelCover = ReelCover.Backdrop(isVideo = false), repostEmbed = quotedReel("orig"))

    private class Taps {
        val reels = mutableListOf<String>()
        val posts = mutableListOf<String>()
    }

    private fun saved(p: FeedPostPresentation, t: Taps): @Composable () -> Unit =
        { SavedPostCard(post = p, onRemove = {}, onClick = {}, onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }) }

    private fun userPosts(p: FeedPostPresentation, t: Taps): @Composable () -> Unit =
        { UserPostCard(post = p, onClick = {}, onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }) }

    private fun nearby(p: FeedPostPresentation, t: Taps): @Composable () -> Unit =
        { NearbyPostCard(post = p, onClick = {}, onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }) }

    private fun detail(p: FeedPostPresentation, t: Taps): @Composable () -> Unit = {
        PostDetailContent(
            post = p, isReposted = false, secondaryTranslation = null, detailLanguageStrip = emptyList(), translatingCodes = emptySet(),
            onFlagTap = {}, onSelectLanguage = {}, onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }, onOpenProfile = null,
            onOpenHashtag = {}, onOpenViewers = null, onRepost = {}, onQuote = {}, onLike = {}, quickEmojis = emptyList(),
            onReact = {}, onBookmark = {}, onCommentNotice = {}, commentsSection = {},
        )
    }

    private fun tapCover(post: FeedPostPresentation, card: (FeedPostPresentation, Taps) -> @Composable () -> Unit): Taps {
        val taps = Taps()
        val content = card(post, taps)
        compose.setContent { MeeshyTheme { content() } }
        compose.onNodeWithContentDescription("Reel").performClick()
        return taps
    }

    @Test fun `Enregistres rend la couverture et ouvre ce reel`() = opensThisReel(::saved)
    @Test fun `Publications d un utilisateur rend la couverture et ouvre ce reel`() = opensThisReel(::userPosts)
    @Test fun `Proximite rend la couverture et ouvre ce reel`() = opensThisReel(::nearby)
    @Test fun `Detail du post rend la couverture et ouvre ce reel`() = opensThisReel(::detail)

    @Test fun `Enregistres - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::saved)
    @Test fun `Publications d un utilisateur - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::userPosts)
    @Test fun `Proximite - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::nearby)
    @Test fun `Detail du post - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::detail)

    private fun opensThisReel(card: (FeedPostPresentation, Taps) -> @Composable () -> Unit) {
        val taps = tapCover(reel, card)
        assertThat(taps.reels).containsExactly("reel1")
        assertThat(taps.posts).isEmpty()
    }

    private fun opensQuotedReel(card: (FeedPostPresentation, Taps) -> @Composable () -> Unit) {
        val taps = tapCover(republished, card)
        assertThat(taps.reels).containsExactly("orig")
        assertThat(taps.posts).isEmpty()
    }
}
