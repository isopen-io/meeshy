package me.meeshy.ui.component.bubble

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ForwardAttribution
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleTopChromeTest {

    @get:Rule
    val compose = createComposeRule()

    private fun bubble(
        pinned: Boolean = false,
        forwarded: Boolean = false,
        attribution: ForwardAttribution = ForwardAttribution.Anonymous,
        isDeleted: Boolean = false,
    ) = BubbleContent(
        messageId = "m1",
        text = "Ordre du jour",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = isDeleted,
        createdAtIso = null,
        pinnedAtIso = if (pinned) "2026-10-23T08:00:00Z" else null,
        isForwarded = forwarded,
        forwardAttribution = attribution,
    )

    private fun show(content: BubbleContent) {
        compose.setContent { MeeshyTheme { BubbleTopChrome(content) } }
        compose.waitForIdle()
    }

    @Test
    fun `the pin is stacked above the forward badge`() {
        show(bubble(pinned = true, forwarded = true, attribution = ForwardAttribution.Group("Lobby")))

        val pin = compose.onNodeWithText("Pinned message").getBoundsInRoot()
        val forward = compose.onNodeWithText("Forwarded from Lobby").getBoundsInRoot()
        assertThat(pin.bottom.value).isAtMost(forward.top.value)
    }

    @Test
    fun `a forward from a one to one names the person`() {
        show(bubble(forwarded = true, attribution = ForwardAttribution.Person("Belva")))

        compose.onNodeWithText("Fwd. from Belva").assertExists()
    }

    @Test
    fun `an anonymous forward says only Forwarded`() {
        show(bubble(forwarded = true))

        compose.onNodeWithText("Forwarded").assertExists()
    }

    @Test
    fun `a deleted message shows no badge`() {
        show(bubble(pinned = true, forwarded = true, isDeleted = true))

        compose.onAllNodesWithText("Pinned message").assertCountEquals(0)
        compose.onAllNodesWithText("Forwarded").assertCountEquals(0)
    }
}
