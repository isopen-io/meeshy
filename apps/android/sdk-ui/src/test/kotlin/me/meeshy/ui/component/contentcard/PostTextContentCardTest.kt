package me.meeshy.ui.component.contentcard

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le texte d'un post déplie son premier lien de contenu en carte (#19331, contrat § 5.2) — jamais le post lui-même, pas
 * sous une vidéo intégrée — et la carte se dit d'un tenant : genre, auteur, texte, vues, favoris, enregistré.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PostTextContentCardTest {

    @get:Rule
    val compose = createComposeRule()

    private val self = "66f0c0ffee0000000000c0de"
    private val other = "66f0c0ffee0000000000beef"

    private class FakeCards(private val state: ContentLinkCardState) : ContentLinkCards {
        val requested = mutableListOf<ContentLinkTarget>()

        override fun initial(target: ContentLinkTarget): ContentLinkCardState {
            requested += target
            return state
        }

        override fun states(target: ContentLinkTarget): Flow<ContentLinkCardState> = flowOf(state)

        override fun open(card: ContentCard, target: ContentLinkTarget) = Unit
    }

    private fun served(postId: String, type: String = "REEL", bookmarked: Boolean = false) = ContentLinkCardState.Card(
        ContentCardProjection.of(
            ApiPost(
                id = postId,
                type = type,
                content = "Au marché",
                author = ApiAuthor(id = "u2", displayName = "Béa"),
                viewCount = 12,
                bookmarkCount = 3,
                isBookmarkedByMe = bookmarked,
            ),
            prefs = null,
            linkType = null,
        ),
    )

    private fun show(text: String, cards: ContentLinkCards) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalContentLinkCards provides cards) {
                    PostTextContentCard(text = text, postId = self)
                }
            }
        }
    }

    @Test
    fun `the first content link of a post text becomes its card`() {
        val cards = FakeCards(served(other))

        show("Regardez https://example.org puis https://meeshy.me/reel/$other", cards)

        compose.onNodeWithContentDescription("Reel by Béa", substring = true).assertExists()
        assertThat(cards.requested).containsExactly(ContentLinkTarget.Content(other, PostType.REEL))
    }

    @Test
    fun `the card says its views and its favorites, and that the reader saved it`() {
        show("https://meeshy.me/reel/$other", FakeCards(served(other, bookmarked = true)))

        compose.onNodeWithContentDescription("Reel by Béa. Au marché. 12 views, 3 saves, Saved").assertExists()
    }

    @Test
    fun `a post never shows its own card`() {
        val cards = FakeCards(served(self))

        show("Mon post https://meeshy.me/post/$self", cards)

        assertThat(cards.requested).isEmpty()
    }

    @Test
    fun `a tracked link that leads back to the post itself shows nothing`() {
        show("https://meeshy.me/l/Ab3xYz", FakeCards(served(self, type = "POST")))

        compose.onNodeWithContentDescription("Post by Béa", substring = true).assertDoesNotExist()
    }

    @Test
    fun `a video embedded under the text keeps its place`() {
        val cards = FakeCards(served(other))

        show("https://www.youtube.com/watch?v=dQw4w9WgXcQ https://meeshy.me/reel/$other", cards)

        assertThat(cards.requested).isEmpty()
    }

    @Test
    fun `without a host for the cards nothing is attached`() {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                PostTextContentCard(text = "https://meeshy.me/reel/$other", postId = self)
            }
        }

        compose.onNodeWithContentDescription("Reel by Béa", substring = true).assertDoesNotExist()
    }
}
