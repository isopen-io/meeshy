package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.ui.component.bubble.BubbleContent
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Spec for [ChatListRow], the dispatcher that draws each [ChatListItem] of the chat list. The
 * split of `ChatScreen` (#11620) must leave every kind of row drawn exactly as before: the day
 * separator, the unread boundary, the end-to-end-encryption notice and the message row with its
 * reply-thread pill.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatListRowTest {

    @get:Rule
    val compose = createComposeRule()

    private class SilentFetcher : LinkPreviewFetcher {
        override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
    }

    private fun bubble(id: String, text: String) = BubbleContent(
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
    )

    private fun show(item: ChatListItem, replyThreads: ReplyThreads = ReplyThreads.EMPTY) {
        val store = LinkPreviewStore(CoroutineScope(Job()), SilentFetcher())
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Column {
                    ChatListRow(
                        item = item,
                        accentColor = MeeshyPalette.Indigo500,
                        mentionDisplayNames = null,
                        highlightTerm = null,
                        replyThreads = replyThreads,
                        linkPreviewStore = store,
                        linkPreviewCache = LinkPreviewCache(),
                        actions = ChatMessageRowActions(),
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `a day header draws the day label`() {
        show(ChatListItem.DayHeader(System.currentTimeMillis()))

        compose.onNodeWithText("Today").assertExists()
    }

    @Test
    fun `the unread boundary draws its pill`() {
        show(ChatListItem.UnreadSeparator)

        compose.onNodeWithText("Unread messages").assertExists()
    }

    @Test
    fun `the encryption notice draws its reassurance copy`() {
        show(ChatListItem.EncryptionNotice)

        compose.onNodeWithText("end-to-end encrypted", substring = true).assertExists()
    }

    @Test
    fun `a message item draws its text through the message row`() {
        show(ChatListItem.Message(bubble(id = "m1", text = "Bonjour la famille")))

        compose.onNodeWithText("Bonjour la famille", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a message that has replies draws its thread pill from the reply threads`() {
        val threads = ReplyThreads.of(
            listOf(
                ReplyLink("m1", null, false),
                ReplyLink("m2", "m1", false),
            ),
        )

        show(ChatListItem.Message(bubble(id = "m1", text = "Bonjour la famille")), replyThreads = threads)

        compose.onNodeWithText("1 reply").assertExists()
    }

    @Test
    fun `a message without replies draws no thread pill`() {
        show(ChatListItem.Message(bubble(id = "m1", text = "Bonjour la famille")))

        compose.onNodeWithText("1 reply").assertDoesNotExist()
    }
}
