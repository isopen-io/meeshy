package me.meeshy.app.calls

import androidx.compose.ui.test.assertHeightIsAtLeast
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class CallHeaderSemanticsTest {
    @get:Rule val rule = createComposeRule()

    private fun connected(peerMuted: Boolean = false) = CallPresenter.present(
        CallState.Connected,
        CallConfig(peerId = "u1", peerName = "Alice", isVideo = true, isOutgoing = true),
        CallMedia(),
        elapsedSeconds = 65,
        mediaEstablished = true,
        peerAudioEnabled = !peerMuted,
    )

    @Test
    fun `toucher la puce ouvre le detail de la qualite`() {
        var opened = 0
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(connected(), conversationId = "c1", showsMinimize = true, onMinimize = {}, onOpenQualityDetail = { opened++ })
            }
        }
        rule.onNodeWithContentDescription("Call duration", substring = true).performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `le libelle de la puce compose la duree et le micro coupe du pair`() {
        rule.setContent { MeeshyTheme { CallHeaderBar(connected(peerMuted = true), conversationId = "c1", showsMinimize = true, onMinimize = {}) } }
        rule.onNodeWithContentDescription("Call duration, Contact muted").assertExists()
    }

    @Test
    fun `la capsule de duree est une cible d'au moins 48 dp`() {
        rule.setContent { MeeshyTheme { CallHeaderBar(connected(), conversationId = "c1", showsMinimize = true, onMinimize = {}) } }
        rule.onNodeWithContentDescription("Call duration", substring = true).assertHeightIsAtLeast(48.dp)
    }
}
