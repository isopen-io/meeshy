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
import me.meeshy.sdk.model.profile.ProfileSheetUser
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
class FlatThreadRowReplyTest {

    @get:Rule
    val compose = createComposeRule()

    private class SilentFetcher : LinkPreviewFetcher {
        override suspend fun fetch(url: String): LinkPreviewOutcome = LinkPreviewOutcome.Empty
    }

    private fun reply(author: ProfileSheetUser? = ProfileSheetUser(userId = "u9", username = "alice")) = BubbleContent(
        messageId = "m2",
        text = "Oui avec plaisir",
        isOutgoing = false,
        isTranslated = false,
        originalText = null,
        senderName = "Bob",
        showSenderName = false,
        isEdited = false,
        isDeleted = false,
        createdAtIso = null,
        replyToId = "m1",
        replyToText = "On se retrouve à 18h ?",
        replyToSenderName = "Alice",
        replyToAuthor = author,
    )

    private fun show(bubble: BubbleContent, actions: ChatMessageRowActions) {
        val store = LinkPreviewStore(CoroutineScope(Job()), SilentFetcher())
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
                        flat = true,
                    )
                }
            }
        }
        compose.waitForIdle()
    }

    @Test
    fun `toucher la citation saute au message d'origine`() {
        val jumped = mutableListOf<String>()
        show(reply(), ChatMessageRowActions(onReplyPreviewClick = { jumped += it }))

        compose.onNodeWithText("On se retrouve à 18h ?", useUnmergedTree = true).performClick()

        assertThat(jumped).containsExactly("m2")
    }

    @Test
    fun `toucher le nom cite ouvre le profil de l'auteur cite`() {
        val opened = mutableListOf<String?>()
        show(reply(), ChatMessageRowActions(onQuotedAuthorTap = { opened += it.replyToAuthor?.userId }))

        compose.onNodeWithText("Alice :", useUnmergedTree = true).performClick()

        assertThat(opened).containsExactly("u9")
    }
}
