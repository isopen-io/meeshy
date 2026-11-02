package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.app.chat.ChatMessageRow
import me.meeshy.app.chat.ChatMessageRowActions
import me.meeshy.app.chat.LinkPreviewStore
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardJoinAccount
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardLink
import me.meeshy.sdk.model.conversationcard.ConversationCardStats
import me.meeshy.sdk.model.conversationcard.ConversationCardViewer
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * Une URL Meeshy de conversation dans une bulle se rend en carte (#13672) : boutons selon le
 * lecteur, gestes remis à la couture [ConversationLinkCards], repli sur l'aperçu générique quand la
 * carte n'est pas servie ou qu'aucun hôte ne fournit les cartes.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationLinkCardRowTest {

    @get:Rule
    val compose = createComposeRule()

    private class SilentFetcher : LinkPreviewFetcher {
        override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
    }

    private class FakeCards(
        initial: ConversationLinkCardState,
        account: ConversationCardJoinAccount? = null,
    ) : ConversationLinkCards {
        override val webOrigin: String = "https://meeshy.me"
        override val joinAccount = MutableStateFlow(account)
        val state = MutableStateFlow(initial)
        val requested = mutableListOf<ConversationCardTarget>()
        val joined = mutableListOf<ConversationCardTarget>()
        val left = mutableListOf<ConversationCardTarget>()

        override fun state(target: ConversationCardTarget): StateFlow<ConversationLinkCardState> {
            requested += target
            return state
        }

        override fun join(target: ConversationCardTarget, onJoined: (String) -> Unit, onFailed: () -> Unit) {
            joined += target
            onJoined("c-joined")
        }

        override fun leave(target: ConversationCardTarget, onDone: (Boolean) -> Unit) {
            left += target
            onDone(true)
        }
    }

    private val outsider = ConversationCard(
        kind = ConversationCardKind.SHARE_LINK,
        title = "Club des polyglottes",
        stats = ConversationCardStats(memberCount = 42),
        viewer = ConversationCardViewer(canJoin = true, canJoinAnonymously = true),
        link = ConversationCardLink(identifier = "club", isActive = true),
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

    private fun show(text: String, cards: ConversationLinkCards?, actions: ChatMessageRowActions = ChatMessageRowActions()) {
        val store = LinkPreviewStore(CoroutineScope(Job()), SilentFetcher())
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                CompositionLocalProvider(LocalConversationLinkCards provides cards) {
                    Column {
                        ChatMessageRow(
                            bubble = bubble(text),
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
    fun `a share link becomes the card of its conversation with join choices`() {
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(outsider)))

        show("Viens https://meeshy.me/join/club", cards)

        compose.onNodeWithText("Join?").assertExists()
        compose.onNodeWithContentDescription("Join anonymously").assertExists()
        compose.onNodeWithContentDescription("Join with my account").assertExists()
        assertThat(cards.requested).containsExactly(ConversationCardTarget.ShareLink("club"))
    }

    @Test
    fun `the join button names the signed-in account and TalkBack speaks its handle`() {
        val account = ConversationCardJoinAccount(title = "Moussa Traoré", handle = "@moussa")
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(outsider)), account)

        show("https://meeshy.me/join/club", cards)

        compose.onNodeWithContentDescription("Join with the account @moussa").assertExists()
        compose.onNodeWithContentDescription("Join with my account").assertDoesNotExist()
    }

    @Test
    fun `joining anonymously opens the guest form directly, never the identity choice`() {
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(outsider)))

        show("https://meeshy.me/join/club", cards)
        compose.onNodeWithContentDescription("Join anonymously").performClick()

        val app = RuntimeEnvironment.getApplication()
        val started = shadowOf(app).nextStartedActivity
        assertThat(started.data.toString()).isEqualTo("meeshy://join/club?anonymous=true")
        assertThat(started.`package`).isEqualTo(app.packageName)
    }

    @Test
    fun `joining with the account opens the joined conversation`() {
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(outsider)))
        val opened = mutableListOf<String>()

        show("https://meeshy.me/join/club", cards, ChatMessageRowActions(onOpenConversation = { opened += it }))
        compose.onNodeWithContentDescription("Join with my account").performClick()

        assertThat(cards.joined).containsExactly(ConversationCardTarget.ShareLink("club"))
        assertThat(opened).containsExactly("c-joined")
    }

    @Test
    fun `a member leaves first then opens`() {
        val member = outsider.copy(conversationId = "c1", viewer = ConversationCardViewer(isMember = true))
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(member)))
        val opened = mutableListOf<String>()

        show("https://meeshy.me/c/c1", cards, ChatMessageRowActions(onOpenConversation = { opened += it }))
        compose.onNodeWithContentDescription("Open").performClick()
        compose.onNodeWithContentDescription("Leave").performClick()
        compose.onNodeWithText("Leave this conversation?").assertExists()

        assertThat(opened).containsExactly("c1")
        assertThat(cards.left).isEmpty()
    }

    @Test
    fun `confirming the leave hands it to the cards`() {
        val member = outsider.copy(conversationId = "c1", viewer = ConversationCardViewer(isMember = true))
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(member)))

        show("https://meeshy.me/c/c1", cards)
        compose.onNodeWithContentDescription("Leave").performClick()
        compose.onNodeWithText("Leave").performClick()

        assertThat(cards.left).containsExactly(ConversationCardTarget.Direct("c1"))
    }

    @Test
    fun `an expired link says so and offers no button`() {
        val expired = outsider.copy(link = ConversationCardLink(identifier = "club", isActive = false))
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Card(expired)))

        show("https://meeshy.me/join/club", cards)

        compose.onNodeWithText("Link expired").assertExists()
        compose.onNodeWithContentDescription("Join with my account").assertDoesNotExist()
    }

    @Test
    fun `a refused direct link shows the private card, never a title`() {
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.PrivateConversation))

        show("https://meeshy.me/c/c1", cards)

        compose.onNodeWithContentDescription("Private conversation. Only its members can see it.").assertExists()
    }

    @Test
    fun `an unavailable card falls back to the plain link preview`() {
        val cards = FakeCards(ConversationLinkCardState(ConversationLinkCardState.Phase.Unavailable))

        show("https://meeshy.me/join/club", cards)

        compose.onNodeWithText("Join?").assertDoesNotExist()
        compose.onNodeWithText("meeshy.me").assertExists()
    }

    @Test
    fun `an ordinary web link never asks for a card`() {
        val cards = FakeCards(ConversationLinkCardState())

        show("https://example.com/page", cards)

        assertThat(cards.requested).isEmpty()
    }
}
