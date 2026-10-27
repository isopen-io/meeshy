package me.meeshy.app.calls

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
class CallHeaderBarTest {
    @get:Rule val rule = createComposeRule()

    private fun connected(video: Boolean) = CallPresenter.present(
        CallState.Connected,
        CallConfig(peerId = "u1", peerName = "Alice", isVideo = video, isOutgoing = true),
        CallMedia(),
        elapsedSeconds = 65,
        mediaEstablished = true,
    )

    @Test
    fun `en video etablie l'en-tete porte Reduire, Conversation et la puce du chrono, pas le nom`() {
        var minimized = 0
        rule.setContent {
            MeeshyTheme {
                CallHeaderBar(connected(video = true), conversationId = "c1", showsMinimize = true, onMinimize = { minimized++ })
            }
        }
        rule.onNodeWithContentDescription("Minimize call").assertExists()
        rule.onNodeWithContentDescription("Conversation").assertExists()
        rule.onNodeWithContentDescription("Call duration").assertExists()
        rule.onNodeWithText("Alice").assertDoesNotExist()
        rule.onNodeWithContentDescription("Conversation").performClick()
        assertThat(minimized).isEqualTo(1)
    }

    @Test
    fun `sans salon connu la porte vers la conversation disparait, et en audio la puce aussi`() {
        rule.setContent {
            MeeshyTheme { CallHeaderBar(connected(video = false), conversationId = "", showsMinimize = true, onMinimize = {}) }
        }
        rule.onNodeWithContentDescription("Minimize call").assertExists()
        rule.onNodeWithContentDescription("Conversation").assertDoesNotExist()
        rule.onNodeWithContentDescription("Call duration").assertDoesNotExist()
    }
}
