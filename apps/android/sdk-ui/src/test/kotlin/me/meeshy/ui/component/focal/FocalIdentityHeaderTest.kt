package me.meeshy.ui.component.focal

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.meeshyPresenceDotColor
import me.meeshy.sdk.model.PresenceState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FocalIdentityHeaderTest {

    @get:Rule
    val compose = createComposeRule()

    private fun input(isMe: Boolean = false, agent: Boolean = false) = FocalRowInput(
        messageId = "m1", isMe = isMe, isFirstInGroup = true, isLastInGroup = true, senderName = "Mégane",
        senderUserId = null, senderAvatarUrl = null, senderColorHex = null, senderIsAnonymous = false,
        isAgentAuthored = agent, viewingConversationId = null, createdAtIso = null,
        deliveryStatus = me.meeshy.ui.component.bubble.DeliveryStatus.Sent, isSlowSend = false,
        isEdited = false, isOptimistic = false,
    )

    private fun show(input: FocalRowInput, grammar: Boolean = false, onTap: (() -> Unit)? = null) {
        compose.setContent { MeeshyTheme { FocalIdentityHeader(input, agentGrammarEnabled = grammar, onSenderTap = onTap) } }
    }

    @Test
    fun `mon propre message se lit Toi`() {
        show(input(isMe = true))
        compose.onNodeWithText("You", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `l'etincelle d'agent n'apparait que drapeau allume`() {
        show(input(agent = true), grammar = false)
        assertThat(compose.onAllNodes(hasText("✦"), useUnmergedTree = true).fetchSemanticsNodes()).isEmpty()
    }

    @Test
    fun `un message d'agent drapeau allume porte l'etincelle`() {
        show(input(agent = true), grammar = true)
        compose.onNodeWithText("✦", useUnmergedTree = true).assertIsDisplayed()
    }

    @Test
    fun `un toucher sur le nom ouvre le profil`() {
        var taps = 0
        show(input(), onTap = { taps++ })
        compose.onNodeWithText("Mégane", useUnmergedTree = true).performClick()
        assertThat(taps).isEqualTo(1)
    }

    @Test
    fun `une presence hors ligne ne dessine aucun point`() {
        assertThat(meeshyPresenceDotColor(PresenceState.OFFLINE)).isNull()
        assertThat(meeshyPresenceDotColor(null)).isNull()
    }
}
