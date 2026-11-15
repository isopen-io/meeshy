package me.meeshy.ui.component.bubble

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import me.meeshy.ui.component.protection.FLAME_EYE_GLYPH_TAG
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BubbleAfterReadFooterTest {

    @get:Rule
    val compose = createComposeRule()

    private val inAWeek = Instant.now().plusSeconds(7 * 24 * 3600).toString()

    private fun bubble(isAfterRead: Boolean, isOutgoing: Boolean) = BubbleContent(
        messageId = "m1",
        text = "Détruit après lecture",
        isOutgoing = isOutgoing,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        deliveryStatus = DeliveryStatus.Sent,
        expiresAtIso = inAWeek,
        isAfterRead = isAfterRead,
    )

    private fun show(content: BubbleContent) {
        compose.setContent { MeeshyTheme { MessageBubble(content = content) } }
        compose.waitForIdle()
    }

    private val countdown = hasContentDescription("Ephemeral message, expires in", substring = true)

    private fun assertAfterReadFooter() {
        compose.onAllNodesWithTag(FLAME_EYE_GLYPH_TAG, useUnmergedTree = true).assertCountEquals(1)
        compose.onAllNodes(countdown, useUnmergedTree = true).assertCountEquals(0)
    }

    @Test
    fun `my after-read bubble shows its flame-eye and no countdown to the server ceiling, like iOS`() {
        show(bubble(isAfterRead = true, isOutgoing = true))

        assertAfterReadFooter()
    }

    @Test
    fun `a received after-read bubble shows its flame-eye and no countdown, like iOS`() {
        show(bubble(isAfterRead = true, isOutgoing = false))

        assertAfterReadFooter()
    }

    @Test
    fun `a timed ephemeral bubble keeps its countdown`() {
        show(bubble(isAfterRead = false, isOutgoing = true))

        compose.onAllNodes(countdown, useUnmergedTree = true).assertCountEquals(1)
        compose.onAllNodesWithTag(FLAME_EYE_GLYPH_TAG, useUnmergedTree = true).assertCountEquals(0)
    }
}
