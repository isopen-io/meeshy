package me.meeshy.app.chat.conversationcard

import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardJoinAccount
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationCardLink
import me.meeshy.sdk.model.conversationcard.ConversationCardStats
import me.meeshy.sdk.model.conversationcard.ConversationCardViewer
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState.Phase
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w1000dp-h1000dp")
class ConversationLinkCardTest {

    @get:Rule
    val compose = createComposeRule()

    private class StaticCards(phase: Phase) : ConversationLinkCards {
        override val webOrigin = "https://meeshy.me"
        override val joinAccount: StateFlow<ConversationCardJoinAccount?> = MutableStateFlow(null)
        private val state = MutableStateFlow(ConversationLinkCardState(phase))
        override fun state(target: ConversationCardTarget): StateFlow<ConversationLinkCardState> = state
        override fun join(target: ConversationCardTarget, onJoined: (String) -> Unit, onFailed: () -> Unit) = Unit
        override fun leave(target: ConversationCardTarget, onDone: (Boolean) -> Unit) = Unit
    }

    private val card = ConversationCard(
        kind = ConversationCardKind.SHARE_LINK,
        title = "Club des polyglottes",
        description = "On parle de tout",
        stats = ConversationCardStats(memberCount = 42, messageCount = 7, languages = listOf("fr", "en")),
        viewer = ConversationCardViewer(canJoin = true),
        link = ConversationCardLink(identifier = "club", isActive = true),
    )

    private fun show(phase: Phase, widthDp: Int = 300) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                ConversationLinkCard(
                    target = ConversationCardTarget.ShareLink("club"),
                    cards = StaticCards(phase),
                    fallbackAccent = MeeshyPalette.Indigo500,
                    onOpenConversation = {},
                    fallback = { Text("generic preview") },
                )
            }
        }
    }

    @Test
    fun `the loading phase draws the skeleton, never the fallback`() {
        show(Phase.Loading)

        compose.onNodeWithContentDescription("Loading the conversation").assertExists()
        compose.onNodeWithText("generic preview").assertDoesNotExist()
    }

    @Test
    fun `the unavailable phase hands the bubble back to the generic preview`() {
        show(Phase.Unavailable)

        compose.onNodeWithText("generic preview").assertExists()
    }

    @Test
    fun `the card phase speaks its title, description and numbers as one sentence`() {
        show(Phase.Card(card))

        compose.onNodeWithContentDescription(
            "Conversation: Club des polyglottes. On parle de tout. Members: 42. Messages: 7. Languages:",
            substring = true,
        ).assertExists()
    }

    @Test
    fun `an expired card drops its numbers`() {
        show(Phase.Card(card.copy(link = ConversationCardLink(identifier = "club", isActive = false))))

        compose.onNodeWithText("Link expired").assertExists()
        compose.onNodeWithContentDescription("Members:", substring = true).assertDoesNotExist()
    }

    @Test
    fun `the private phase shows the lock notice and no title`() {
        show(Phase.PrivateConversation)

        compose.onNodeWithText("Private conversation").assertExists()
        compose.onNodeWithText("Only its members can see it.").assertExists()
    }

    @Test
    fun `a wide card keeps four language pills and counts the rest`() {
        val many = card.copy(stats = card.stats.copy(languages = listOf("fr", "en", "es", "pt", "de")))
        compose.setContent {
            MeeshyTheme(darkTheme = false) { StatsRow(many.stats, MeeshyPalette.Indigo500) }
        }

        compose.onNodeWithText("+1", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a narrow card gives up every language pill before its numbers`() {
        val many = card.copy(stats = ConversationCardStats(memberCount = 42, languages = listOf("fr", "en", "es", "pt", "de")))
        compose.setContent {
            MeeshyTheme(darkTheme = false) { StatsRow(many.stats, MeeshyPalette.Indigo500, Modifier.width(60.dp)) }
        }

        compose.onNodeWithText("+5", useUnmergedTree = true).assertExists()
    }
}
