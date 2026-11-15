package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performSemanticsAction
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class IncomingCallDeclineWithMessageTest {
    @get:Rule val rule = createComposeRule()

    private val incoming = CallConfig(peerId = "u1", peerName = "Alice", isVideo = false, isOutgoing = false)
    private val sent = mutableListOf<String>()

    private val handler: (String) -> Unit = { text -> sent.add(text) }

    private fun show(withMessage: Boolean) = rule.setContent {
        MeeshyTheme {
            IncomingCallScreen(
                state = CallPresenter.present(CallState.Ringing(false), incoming, CallMedia()),
                peer = CallPeerVisual.EMPTY,
                reduceMotion = true,
                onAccept = {},
                onDecline = {},
                onDeclineWithMessage = if (withMessage) handler else null,
            )
        }
    }

    @Test
    fun `sans canal de reponse l'ecran n'offre pas le bouton Message`() {
        show(withMessage = false)
        rule.onNodeWithContentDescription("Decline with a message").assertDoesNotExist()
    }

    @Test
    fun `le bouton Message ouvre la feuille et une reponse rapide part telle quelle`() {
        show(withMessage = true)
        rule.onNodeWithContentDescription("Decline with a message").performClick()
        rule.waitForIdle()
        rule.mainClock.advanceTimeBy(1_000)
        rule.onNodeWithText("I’m in a meeting.").performSemanticsAction(SemanticsActions.OnClick)

        assertThat(sent).containsExactly("I’m in a meeting.")
        rule.onNodeWithText("Decline with a message").assertDoesNotExist()
    }

    @Test
    fun `Envoyer et refuser reste inactif tant que le champ est vide`() {
        show(withMessage = true)
        rule.onNodeWithContentDescription("Decline with a message").performClick()
        rule.onNodeWithText("Send and decline").performSemanticsAction(SemanticsActions.OnClick)

        assertThat(sent).isEmpty()
    }
}
