package me.meeshy.app.conversations

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * iOS `ConversationListView` : le rail de stories puis les filtres sont les premières lignes de la liste, ils
 * défilent avec elle (#13664). Monte l'ÉCRAN réel (ViewModel simulé) et fait défiler la liste peuplée.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListScreenScrollTest {

    @get:Rule
    val compose = createComposeRule()

    private fun conversations(count: Int, pinned: Int = 0) =
        (1..count).map {
            ApiConversation(
                id = "c$it",
                title = "Conv $it",
                type = "group",
                userPreferences = listOf(ApiConversationPreferences(isPinned = it <= pinned)),
            )
        }

    private fun screen(count: Int, pinned: Int = 0, skeleton: Boolean = false) {
        val state = ConversationListUiState(conversations = conversations(count, pinned), showSkeleton = skeleton)
        val viewModel = mockk<ConversationListViewModel>(relaxed = true) {
            every { this@mockk.state } returns MutableStateFlow(state)
            every { rowSignals } returns MutableStateFlow(ConversationRowSignals())
            every { pullRefreshSucceeded } returns emptyFlow()
            every { openConversation } returns emptyFlow()
            every { dialogs } returns mockk<ConversationListDialogController>(relaxed = true) {
                every { dialog } returns MutableStateFlow(null)
                every { effects } returns emptyFlow()
            }
        }
        compose.setContent {
            MeeshyTheme {
                ConversationListScreen(
                    onConversationClick = {},
                    onLogout = {},
                    viewModel = viewModel,
                    header = { Box(Modifier.height(120.dp).testTag("rail")) { Text("rail") } },
                )
            }
        }
    }

    @Test
    fun `liste peuplee le rail et les filtres sont en tete de liste`() {
        screen(count = 40)

        compose.onNodeWithTag("rail").assertIsDisplayed()
    }

    @Test
    fun `liste peuplee faire defiler la liste emporte le rail`() {
        screen(count = 40)

        compose.onNodeWithTag(CONVERSATION_LIST_TAG).performTouchInput { swipeUp() }
        compose.waitForIdle()

        compose.onNodeWithTag("rail").assertDoesNotExist()
    }

    @Test
    fun `liste en sections epingles puis mes conversations le rail defile aussi`() {
        screen(count = 40, pinned = 2)

        compose.onNodeWithTag("rail").assertIsDisplayed()
        compose.onNodeWithTag(CONVERSATION_LIST_TAG).performTouchInput { swipeUp() }
        compose.waitForIdle()

        compose.onNodeWithTag("rail").assertDoesNotExist()
    }

    @Test
    fun `squelette le rail est la premiere ligne de la meme liste, il defile avec elle`() {
        screen(count = 0, skeleton = true)

        compose.onNodeWithTag("rail").assertIsDisplayed()
        compose.onNodeWithTag(CONVERSATION_LIST_TAG).assertIsDisplayed()
    }

    @Test
    fun `liste vide le rail est a la meme place que liste peuplee`() {
        screen(count = 0, skeleton = false)

        compose.onNodeWithTag("rail").assertIsDisplayed()
        compose.onNodeWithTag(CONVERSATION_LIST_TAG).assertIsDisplayed()
    }
}
