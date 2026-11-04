package me.meeshy.app.conversations

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.ui.test.junit4.ComposeContentTestRule
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import com.google.common.truth.Truth.assertThat
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.emptyFlow
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ApiConversationPreferences
import me.meeshy.sdk.model.CategoryOption
import me.meeshy.sdk.model.search.ListMessageSearchState
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

internal fun listBodyConversations(count: Int, pinned: Int = 0, categoryOf: (Int) -> String? = { null }) =
    (1..count).map {
        ApiConversation(
            id = "c$it",
            title = "Conv $it",
            type = "group",
            userPreferences = listOf(ApiConversationPreferences(isPinned = it <= pinned, categoryId = categoryOf(it))),
        )
    }

/** Monte le corps réel de la liste sur un ViewModel simulé dont le pliage répond comme le vrai. */
internal fun ComposeContentTestRule.setListBody(
    conversations: List<ApiConversation>,
    categories: List<CategoryOption> = emptyList(),
    onListState: (LazyListState) -> Unit = {},
): ConversationListViewModel {
    val remembered = MutableStateFlow<Set<String>?>(null)
    val state = ConversationListUiState(conversations = conversations, categories = categories, showSkeleton = false)
    val viewModel = mockk<ConversationListViewModel>(relaxed = true) {
        every { this@mockk.state } returns MutableStateFlow(state)
        every { rowSignals } returns MutableStateFlow(ConversationRowSignals())
        every { rememberedSections } returns remembered
        every { messageSearch } returns MutableStateFlow(ListMessageSearchState.Idle)
        every { pullRefreshSucceeded } returns emptyFlow()
        every { onSectionToggled(any(), any()) } answers {
            val current = remembered.value ?: ConversationSectionExpansionStore.effective(null, categories)
            val section = firstArg<ConversationSection>()
            remembered.value = if (secondArg()) current + section.sectionId else current - section.sectionId
        }
    }
    setContent {
        MeeshyTheme {
            val listState = rememberLazyListState()
            onListState(listState)
            ConversationListBody(
                state = state,
                listState = listState,
                viewModel = viewModel,
                content = ConversationListContent.of(state, messageSectionShown = false),
            )
        }
    }
    return viewModel
}

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ConversationListBodyLazyTest {

    @get:Rule
    val compose = createComposeRule()

    @Test
    fun `avec 500 conversations seules les lignes visibles sont composees`() {
        compose.setListBody(listBodyConversations(500))
        compose.waitForIdle()

        val composed = compose.onAllNodesWithTag(ROW_TEST_TAG).fetchSemanticsNodes().size

        assertThat(composed).isAtLeast(1)
        assertThat(composed).isAtMost(40)
    }

    @Test
    fun `chaque ligne porte la cle de sa conversation`() {
        var listState: LazyListState? = null
        compose.setListBody(listBodyConversations(500)) { listState = it }
        compose.waitForIdle()

        val keys = listState!!.layoutInfo.visibleItemsInfo.map { it.key }

        assertThat(keys).contains("c1")
        assertThat(keys).contains("c2")
    }

    @Test
    fun `en sections chaque ligne reste un item distinct et l'en-tete est epingle`() {
        var listState: LazyListState? = null
        compose.setListBody(listBodyConversations(300, pinned = 3)) { listState = it }
        compose.waitForIdle()

        val keys = listState!!.layoutInfo.visibleItemsInfo.map { it.key }

        assertThat(keys).containsAtLeast("section-PINNED", "c1", "c2", "c3", "section-ALL", "c4")
        assertThat(compose.onAllNodesWithTag(ROW_TEST_TAG).fetchSemanticsNodes().size).isAtMost(40)
    }
}
