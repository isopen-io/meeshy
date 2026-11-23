package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.model.ApiAuthor
import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.PostType
import me.meeshy.sdk.model.contentcard.ContentCard
import me.meeshy.sdk.model.contentcard.ContentCardProjection
import me.meeshy.sdk.model.contentcard.ContentLinkCardState
import me.meeshy.sdk.model.deeplink.ContentLinkTarget
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.component.contentcard.ContentLinkCards
import me.meeshy.ui.component.contentcard.LocalContentLinkCards
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Un lien de post, de réel, de story ou d'humeur dans une bulle se rend en carte de CONTENU (#19331) : la carte à la
 * place de l'aperçu générique, son toucher remis à la couture [ContentLinkCards], la ligne « plus disponible » sur un
 * refus, l'aperçu générique sur une panne — et rien du tout pour un message que seul l'appareil lit.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ContentLinkCardRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val id = "66f0c0ffee0000000000c0de"

    private class SilentFetcher : LinkPreviewFetcher {
        override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
    }

    private class FakeContentCards(private val state: ContentLinkCardState) : ContentLinkCards {
        val requested = mutableListOf<ContentLinkTarget>()
        val opened = mutableListOf<ContentLinkTarget>()

        override fun initial(target: ContentLinkTarget): ContentLinkCardState {
            requested += target
            return state
        }

        override fun states(target: ContentLinkTarget): Flow<ContentLinkCardState> = flowOf(state)

        override fun open(card: ContentCard, target: ContentLinkTarget) {
            opened += target
        }
    }

    private val served = ContentLinkCardState.Card(
        ContentCardProjection.of(
            ApiPost(id = id, type = "POST", content = "Bonjour", author = ApiAuthor(id = "u1", displayName = "Amani"), viewCount = 12),
            prefs = null,
            linkType = PostType.POST,
        ),
    )

    private fun bubble(text: String) = BubbleContent(
        messageId = "m1",
        text = text,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        deliveryStatus = DeliveryStatus.Sent,
    )

    private fun show(bubble: BubbleContent, cards: ContentLinkCards?, actions: ChatMessageRowActions = ChatMessageRowActions()) {
        val store = LinkPreviewStore(CoroutineScope(Job()), SilentFetcher())
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalContentLinkCards provides cards) {
                    Column {
                        ChatMessageRow(
                            bubble = bubble,
                            accentColor = MeeshyPalette.Indigo500,
                            mentionDisplayNames = null,
                            highlightTerm = null,
                            replyCount = null,
                            linkPreviewStore = store,
                            linkPreviewCache = LinkPreviewCache(),
                            actions = actions,
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `a content link becomes the card of the content, never the generic preview`() {
        val cards = FakeContentCards(served)

        show(bubble("Regarde https://meeshy.me/post/$id"), cards)

        compose.onNodeWithContentDescription("Post by Amani", substring = true).assertExists()
        compose.onNodeWithText("meeshy.me").assertDoesNotExist()
        assertThat(cards.requested).containsExactly(ContentLinkTarget.Content(id, PostType.POST))
    }

    @Test
    fun `a tap on the card opens its content through the cards`() {
        val cards = FakeContentCards(served)
        show(bubble("https://meeshy.me/post/$id"), cards)

        compose.onNodeWithContentDescription("Post by Amani", substring = true).performClick()

        assertThat(cards.opened).containsExactly(ContentLinkTarget.Content(id, PostType.POST))
    }

    @Test
    fun `a long press on the card keeps the message menu`() {
        val pressed = mutableListOf<String>()
        show(bubble("https://meeshy.me/post/$id"), FakeContentCards(served), ChatMessageRowActions(onLongPress = { pressed += it }))

        compose.onNodeWithContentDescription("Post by Amani", substring = true).performTouchInput { longClick() }

        assertThat(pressed).containsExactly("m1")
    }

    @Test
    fun `a content the reader may no longer read is a quiet unavailable line`() {
        show(bubble("https://meeshy.me/reel/$id"), FakeContentCards(ContentLinkCardState.Unavailable(PostType.REEL)))

        compose.onNodeWithContentDescription("This content is no longer available").assertExists()
        compose.onNodeWithText("meeshy.me").assertDoesNotExist()
    }

    @Test
    fun `a failure on an empty cache gives the bubble back to the generic preview of the link`() {
        show(bubble("https://meeshy.me/post/$id"), FakeContentCards(ContentLinkCardState.Failed))

        compose.onNodeWithText("meeshy.me").assertExists()
    }

    @Test
    fun `without a host for the cards the generic preview stays`() {
        show(bubble("https://meeshy.me/post/$id"), null)

        compose.onNodeWithText("meeshy.me").assertExists()
    }

    @Test
    fun `a message read only on this device lets no link out, neither card nor preview`() {
        val cards = FakeContentCards(served)

        show(bubble("https://meeshy.me/post/$id").copy(isEndToEndOpened = true), cards)

        assertThat(cards.requested).isEmpty()
        compose.onNodeWithText("meeshy.me").assertDoesNotExist()
    }

    @Test
    fun `a message from an author without an account attaches nothing`() {
        val cards = FakeContentCards(served)

        show(bubble("https://meeshy.me/post/$id").copy(senderHasAccount = false), cards)

        assertThat(cards.requested).isEmpty()
        compose.onNodeWithText("meeshy.me").assertDoesNotExist()
    }
}
