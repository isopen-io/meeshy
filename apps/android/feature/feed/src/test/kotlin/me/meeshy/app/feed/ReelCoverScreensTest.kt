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

/** #13666 — Enregistrés, Publications d'un utilisateur, Proximité (#13244 : une seule carte) et Détail du post rendent la couverture du fil et ouvrent CE réel. */
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

    /** Les favoris, les publications d'un auteur, « À proximité » et un hashtag montent la même carte (#13244). */
    private fun listed(p: FeedPostPresentation, t: Taps): @Composable () -> Unit = {
        ListedPostCard(
            post = p, actions = RecordingCardActions(), sheets = ListedPostSheets(), share = recordingShare(mutableListOf()),
            onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }, onOpenProfile = null, onOpenHashtag = {},
        )
    }

    private fun detail(p: FeedPostPresentation, t: Taps): @Composable () -> Unit = {
        PostDetailContent(
            post = p, isReposted = false, secondaryTranslation = null, detailLanguageStrip = emptyList(), translatingCodes = emptySet(),
            onFlagTap = {}, onSelectLanguage = {}, onOpenPost = { t.posts += it }, onOpenReel = { t.reels += it }, onOpenProfile = null,
            onOpenHashtag = {}, onOpenViewers = null, onRepost = {}, onQuote = {}, onLike = {}, quickEmojis = emptyList(),
            onReact = {}, onBookmark = {}, onCommentNotice = {}, commentsSection = {}, commentComposer = {},
        )
    }

    private fun tapCover(post: FeedPostPresentation, label: String, card: (FeedPostPresentation, Taps) -> @Composable () -> Unit): Taps {
        val taps = Taps()
        val content = card(post, taps)
        compose.setContent { MeeshyTheme { content() } }
        compose.onNodeWithContentDescription(label).performClick()
        return taps
    }

    @Test fun `Enregistres, Publications d un utilisateur et Proximite rendent la couverture et ouvrent ce reel`() = opensThisReel(::listed)
    @Test fun `Detail du post rend la couverture et ouvre ce reel`() = opensThisReel(::detail)

    @Test fun `les listes - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::listed)
    @Test fun `Detail du post - un reel republie n a qu une couverture et ouvre le reel cite`() = opensQuotedReel(::detail)

    private fun opensThisReel(card: (FeedPostPresentation, Taps) -> @Composable () -> Unit) {
        val taps = tapCover(reel, "Reel by Amina", card)
        assertThat(taps.reels).containsExactly("reel1")
        assertThat(taps.posts).isEmpty()
    }

    private fun opensQuotedReel(card: (FeedPostPresentation, Taps) -> @Composable () -> Unit) {
        val taps = tapCover(republished, "Reel by Origen", card)
        assertThat(taps.reels).containsExactly("orig")
        assertThat(taps.posts).isEmpty()
    }
}
