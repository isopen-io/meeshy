package me.meeshy.ui.component.bubble

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubblePinnedIndicatorTest {

    @get:Rule
    val compose = createComposeRule()

    private fun bubble(pinnedAtIso: String?, isDeleted: Boolean = false) = BubbleContent(
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
        deliveryStatus = DeliveryStatus.Sent,
        pinnedAtIso = pinnedAtIso,
    )

    private fun show(content: BubbleContent) {
        compose.setContent { MeeshyTheme { MessageBubble(content = content) } }
        compose.waitForIdle()
    }

    @Test
    fun `a pinned bubble carries a visible pin`() {
        show(bubble(pinnedAtIso = "2026-10-23T08:00:00Z"))

        compose.onNodeWithContentDescription("Pinned").assertIsDisplayed()
    }

    @Test
    fun `an unpinned bubble carries no pin`() {
        show(bubble(pinnedAtIso = null))

        compose.onAllNodesWithContentDescription("Pinned").assertCountEquals(0)
    }
}
