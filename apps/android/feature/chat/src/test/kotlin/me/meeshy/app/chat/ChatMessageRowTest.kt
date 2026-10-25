package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeRight
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
        canWrite: Boolean = true,
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
                        canWrite = canWrite,
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

    private fun spokenActions(text: String = "Salut à tous"): List<CustomAccessibilityAction> {
        val config = compose.onNodeWithText(text).fetchSemanticsNode().config
        return config.getOrNull(SemanticsActions.CustomActions).orEmpty()
    }

    private fun swipeTowardReply(text: String = "Salut à tous") {
        compose.onNodeWithText(text).performTouchInput { swipeRight(startX = centerX, endX = centerX + 180f) }
        compose.waitForIdle()
    }

    @Test
    fun `TalkBack offers the reply and the forward the law grants, each reporting its own id`() {
        val replied = mutableListOf<String>()
        val forwarded = mutableListOf<String>()
        show(
            bubble(id = "m4"),
            actions = ChatMessageRowActions(onReply = { replied += it }, onForward = { forwarded += it }),
        )

        val spoken = spokenActions()
        assertThat(spoken.map { it.label }).containsExactly("Reply", "Forward").inOrder()
        compose.runOnIdle { spoken.forEach { it.action() } }

        assertThat(replied).containsExactly("m4")
        assertThat(forwarded).containsExactly("m4")
    }

    @Test
    fun `TalkBack offers no reply to a reader who may not write`() {
        show(bubble(), canWrite = false)

        assertThat(spokenActions().map { it.label }).containsExactly("Forward")
    }

    @Test
    fun `TalkBack offers nothing on a bubble the server does not know yet`() {
        show(bubble(id = "cid_0b8f3c2e-4d5a-4b6c-8d7e-9f0a1b2c3d4e"))

        assertThat(spokenActions()).isEmpty()
    }

    @Test
    fun `swiping an answerable message toward reply replies to it`() {
        val replied = mutableListOf<String>()
        show(bubble(id = "m5"), actions = ChatMessageRowActions(onReply = { replied += it }))

        swipeTowardReply()

        assertThat(replied).containsExactly("m5")
    }

    @Test
    fun `swiping a message the law refuses to answer replies to nothing`() {
        val replied = mutableListOf<String>()
        show(bubble(id = "m6"), actions = ChatMessageRowActions(onReply = { replied += it }), canWrite = false)

        swipeTowardReply()

        assertThat(replied).isEmpty()
    }
}
