package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.component.bubble.DeliveryStatus
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Smoke and behaviour spec for [ChatMessageRow], the single extension point of a message in the
 * chat list (#11620). The row is split out of `ChatScreen` with no visible change, so these
 * tests pin what the user sees and can do on one message — the text, the retry line of a failed
 * send, the reply-thread pill — through the public composable and its callbacks only.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatMessageRowTest {

    @get:Rule
    val compose = createComposeRule()

    private class SilentFetcher : LinkPreviewFetcher {
        override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
    }

    private fun bubble(
        id: String = "m1",
        text: String = "Salut à tous",
        deliveryStatus: DeliveryStatus = DeliveryStatus.Sent,
    ) = BubbleContent(
        messageId = id,
        text = text,
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = null,
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        deliveryStatus = deliveryStatus,
    )

    private fun show(
        bubble: BubbleContent,
        replyCount: Int? = null,
        actions: ChatMessageRowActions = ChatMessageRowActions(),
    ) {
        val store = LinkPreviewStore(CoroutineScope(Job()), SilentFetcher())
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Column {
                    ChatMessageRow(
                        bubble = bubble,
                        accentColor = MeeshyPalette.Indigo500,
                        mentionDisplayNames = null,
                        highlightTerm = null,
                        replyCount = replyCount,
                        linkPreviewStore = store,
                        linkPreviewCache = LinkPreviewCache(),
                        actions = actions,
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    private val retryLabel = "Not sent — tap to retry"

    private fun replyCountLabel(count: Int): String = if (count == 1) "1 reply" else "$count replies"

    @Test
    fun `a text message composes and shows its text`() {
        show(bubble(text = "Salut à tous"))

        compose.onNodeWithText("Salut à tous", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a delivered message shows no retry line and no thread pill`() {
        show(bubble())

        compose.onNodeWithText(retryLabel).assertDoesNotExist()
        compose.onNodeWithText(replyCountLabel(2)).assertDoesNotExist()
    }

    @Test
    fun `a failed message offers a retry that reports its own id`() {
        val retried = mutableListOf<String>()
        show(
            bubble(id = "m7", deliveryStatus = DeliveryStatus.Failed),
            actions = ChatMessageRowActions(onRetry = { retried += it }),
        )

        compose.onNodeWithText(retryLabel).performClick()

        assertThat(retried).containsExactly("m7")
    }

    @Test
    fun `a message with replies shows the thread pill and a tap reports its own id`() {
        val tapped = mutableListOf<String>()
        show(
            bubble(id = "m3"),
            replyCount = 2,
            actions = ChatMessageRowActions(onReplyCountTap = { tapped += it }),
        )

        compose.onNodeWithText(replyCountLabel(2)).performClick()

        assertThat(tapped).containsExactly("m3")
    }
}
