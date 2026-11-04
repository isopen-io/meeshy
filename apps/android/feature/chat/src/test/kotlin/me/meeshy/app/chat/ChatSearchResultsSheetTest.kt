package me.meeshy.app.chat

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.graphics.Color
import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.search.ConversationSearchResult
import me.meeshy.sdk.model.search.SearchMatchType
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.CompositionLocalProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChatSearchResultsSheetTest {

    @get:Rule
    val compose = createComposeRule()

    private fun result(id: String, text: String, type: SearchMatchType = SearchMatchType.CONTENT) = ConversationSearchResult(
        id = id, conversationId = "c1", content = text, matchedText = text, matchType = type,
        senderName = "Ada", senderAvatar = null, createdAtIso = null,
    )

    private fun show(state: ChatServerSearchState, onSelect: (String) -> Unit = {}, onRetry: () -> Unit = {}) {
        compose.setContent {
            MeeshyTheme {
                CompositionLocalProvider(LocalReduceMotion provides true) {
                    ChatSearchResultsSheet(state, MeeshyPalette.Indigo500, onSelect, onLoadMore = {}, onRetry = onRetry)
                }
            }
        }
    }

    @Test
    fun `highlightedMatch washes every occurrence of the term, accents and case aside`() {
        val text = highlightedMatch("Café et cafe", "CAFE", Color.Yellow)

        assertThat(text.text).isEqualTo("Café et cafe")
        assertThat(text.spanStyles.map { text.text.substring(it.start, it.end) }).containsExactly("Café", "cafe").inOrder()
    }

    @Test
    fun `tapping a result jumps to its message`() {
        var selected: String? = null
        show(ChatServerSearchState(query = "hello", results = listOf(result("m1", "hello there"), result("m2", "hello again"))), onSelect = { selected = it })

        compose.onAllNodesWithContentDescription("Go to message from Ada")[1].performClick()

        assertThat(selected).isEqualTo("m2")
    }

    @Test
    fun `a translation match is flagged`() {
        show(ChatServerSearchState(query = "bonjour", results = listOf(result("m1", "bonjour tout le monde", SearchMatchType.TRANSLATION))))

        compose.onNodeWithText("Translation", useUnmergedTree = true).assertExists()
    }

    @Test
    fun `a failure offers a retry`() {
        var retried = false
        show(ChatServerSearchState(query = "he", failed = true), onRetry = { retried = true })

        compose.onNodeWithText("Retry").performClick()

        assertThat(retried).isTrue()
    }

    @Test
    fun `no result and offline are said plainly`() {
        show(ChatServerSearchState(query = "zz", isOffline = true))

        compose.onNodeWithText("No matches").assertExists()
        compose.onNodeWithText("Offline: local results only").assertExists()
    }
}
