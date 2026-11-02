package me.meeshy.app.chat

import androidx.compose.foundation.layout.Column
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
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

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatSelectionRowTest {

    @get:Rule
    val compose = createComposeRule()

    private val bubble = BubbleContent(
        messageId = "m1", text = "Salut", isOutgoing = false, isTranslated = false, originalText = null,
        senderName = null, showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
    )

    private fun show(selecting: Boolean, actions: ChatMessageRowActions) {
        val store = LinkPreviewStore(CoroutineScope(Job()), object : LinkPreviewFetcher {
            override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
        })
        compose.setContent {
            MeeshyTheme(darkTheme = false) {
                Column {
                    ChatMessageRow(
                        bubble = bubble,
                        accentColor = MeeshyPalette.Indigo500,
                        mentionDisplayNames = null,
                        highlightTerm = null,
                        replyCount = null,
                        linkPreviewStore = store,
                        linkPreviewCache = LinkPreviewCache(),
                        actions = actions,
                        selecting = selecting,
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `in selection mode a tap on the row toggles it`() {
        val toggled = mutableListOf<String>()
        show(selecting = true, actions = ChatMessageRowActions(onToggleSelection = { toggled += it }))
        compose.onNodeWithContentDescription("Message").performClick()
        assertThat(toggled).containsExactly("m1")
    }

    @Test
    fun `outside the mode the row carries no selection target`() {
        show(selecting = false, actions = ChatMessageRowActions())
        compose.onNodeWithContentDescription("Message").assertDoesNotExist()
    }
}
