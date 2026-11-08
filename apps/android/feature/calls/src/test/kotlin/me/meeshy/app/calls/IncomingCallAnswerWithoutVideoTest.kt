package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** Vue P17 : un appel vidéo entrant offre « Sans vidéo » entre Refuser et Répondre ; un appel audio ne l'offre pas. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class IncomingCallAnswerWithoutVideoTest {
    @get:Rule val rule = createComposeRule()

    private val noVideo = "Answer without video. Answers with your camera off: the caller sees your avatar"
    private val accept = "Accept. Answers the incoming call"

    private fun show(isVideo: Boolean, taps: MutableList<String>) = rule.setContent {
        val config = CallConfig(peerId = "u1", peerName = "Alice", isVideo = isVideo, isOutgoing = false, callId = "c1")
        MeeshyTheme {
            IncomingCallScreen(
                state = CallPresenter.present(CallState.Ringing(false), config, CallMedia()),
                peer = CallPeerVisual.EMPTY,
                reduceMotion = true,
                onAccept = { taps += "accept" },
                onDecline = { taps += "decline" },
                onAcceptWithoutVideo = { taps += "without-video" },
            )
        }
    }

    @Test
    fun `toucher Sans video decroche sans la camera, et pas comme Repondre`() {
        val taps = mutableListOf<String>()
        show(isVideo = true, taps)

        rule.onNodeWithContentDescription(noVideo).performClick()

        assertThat(taps).containsExactly("without-video")
    }

    @Test
    fun `Repondre garde son chemin sur un appel video`() {
        val taps = mutableListOf<String>()
        show(isVideo = true, taps)

        rule.onNodeWithContentDescription(accept).performClick()

        assertThat(taps).containsExactly("accept")
    }

    @Test
    fun `un appel audio n'offre pas Sans video`() {
        show(isVideo = false, mutableListOf())

        rule.onNodeWithContentDescription(noVideo).assertDoesNotExist()
        rule.onNodeWithContentDescription(accept).assertExists()
    }
}
