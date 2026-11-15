package me.meeshy.app.chat

import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.app.chat.conversationcard.ConversationLinkCards
import me.meeshy.sdk.model.conversationcard.ConversationCard
import me.meeshy.sdk.model.conversationcard.ConversationCardJoinAccount
import me.meeshy.sdk.model.conversationcard.ConversationCardKind
import me.meeshy.sdk.model.conversationcard.ConversationLinkCardState
import me.meeshy.sdk.model.deeplink.ConversationCardTarget
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MessageLinkAttachmentTest {

    @get:Rule
    val compose = createComposeRule()

    private class Cards(phase: ConversationLinkCardState.Phase) : ConversationLinkCards {
        override val webOrigin = "https://meeshy.me"
        override val joinAccount: StateFlow<ConversationCardJoinAccount?> = MutableStateFlow(null)
        private val state = MutableStateFlow(ConversationLinkCardState(phase))
        override fun state(target: ConversationCardTarget): StateFlow<ConversationLinkCardState> = state
        override fun join(target: ConversationCardTarget, onJoined: (String) -> Unit, onFailed: () -> Unit) = Unit
        override fun leave(target: ConversationCardTarget, onDone: (Boolean) -> Unit) = Unit
    }

    private fun show(target: ConversationCardTarget?, cards: ConversationLinkCards?) {
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                MessageLinkAttachment(
                    cardTarget = target,
                    cards = cards,
                    fallbackAccent = MeeshyPalette.Indigo500,
                    onOpenConversation = {},
                    preview = { Text("generic preview") },
                )
            }
        }
    }

    private val served = ConversationLinkCardState.Phase.Card(
        ConversationCard(kind = ConversationCardKind.SHARE_LINK, title = "Club"),
    )

    @Test
    fun `a conversation target replaces the generic preview with its card`() {
        show(ConversationCardTarget.ShareLink("club"), Cards(served))

        compose.onNodeWithText("generic preview").assertDoesNotExist()
    }

    @Test
    fun `no target keeps the generic preview`() {
        show(null, Cards(served))

        compose.onNodeWithText("generic preview").assertExists()
    }

    @Test
    fun `no card host keeps the generic preview`() {
        show(ConversationCardTarget.ShareLink("club"), null)

        compose.onNodeWithText("generic preview").assertExists()
    }

    @Test
    fun `an unavailable card gives the bubble back to the generic preview`() {
        show(ConversationCardTarget.ShareLink("club"), Cards(ConversationLinkCardState.Phase.Unavailable))

        compose.onNodeWithText("generic preview").assertExists()
    }
}
