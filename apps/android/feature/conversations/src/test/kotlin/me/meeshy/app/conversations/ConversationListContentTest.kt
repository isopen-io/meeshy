package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.ConversationFilter
import org.junit.Test

/**
 * Empty-state decision (parity §B "Cold-start skeletons + error-with-retry empty
 * state"). The single source of truth for *which* region the conversation list
 * renders — asserted through the pure [ConversationListContent.of], never the
 * Composable glue. Cache-first (ARCHITECTURE.md §4): populated data always wins
 * over a stale skeleton flag.
 */
class ConversationListContentTest {

    private fun conv(id: String) = ApiConversation(id = id)

    private fun state(
        conversations: List<ApiConversation> = emptyList(),
        showSkeleton: Boolean = false,
        errorMessage: String? = null,
        selectedFilter: ConversationFilter = ConversationFilter.ALL,
        searchText: String = "",
    ) = ConversationListUiState(
        conversations = conversations,
        showSkeleton = showSkeleton,
        errorMessage = errorMessage,
        selectedFilter = selectedFilter,
        searchText = searchText,
    )

    @Test
    fun `data present renders the populated list`() {
        assertThat(ConversationListContent.of(state(conversations = listOf(conv("a")))))
            .isEqualTo(ConversationListContent.Populated)
    }

    @Test
    fun `cache-first — data present wins over a stale skeleton flag`() {
        val content = ConversationListContent.of(
            state(conversations = listOf(conv("a")), showSkeleton = true),
        )

        assertThat(content).isEqualTo(ConversationListContent.Populated)
    }

    @Test
    fun `cache-first — data present wins over a background sync error`() {
        val content = ConversationListContent.of(
            state(conversations = listOf(conv("a")), errorMessage = "offline"),
        )

        assertThat(content).isEqualTo(ConversationListContent.Populated)
    }

    @Test
    fun `cold empty cache while loading renders the skeleton`() {
        assertThat(ConversationListContent.of(state(showSkeleton = true)))
            .isEqualTo(ConversationListContent.Skeleton)
    }

    @Test
    fun `empty cache with a sync error renders the error carrying the message`() {
        val content = ConversationListContent.of(state(errorMessage = "network down"))

        assertThat(content).isEqualTo(ConversationListContent.Error("network down"))
    }

    @Test
    fun `skeleton takes precedence over a concurrent error`() {
        val content = ConversationListContent.of(state(showSkeleton = true, errorMessage = "boom"))

        assertThat(content).isEqualTo(ConversationListContent.Skeleton)
    }

    @Test
    fun `error takes precedence over an active filter narrowing to nothing`() {
        val content = ConversationListContent.of(
            state(errorMessage = "boom", selectedFilter = ConversationFilter.UNREAD),
        )

        assertThat(content).isEqualTo(ConversationListContent.Error("boom"))
    }

    @Test
    fun `active filter matching nothing renders the filtered-empty message`() {
        val content = ConversationListContent.of(state(selectedFilter = ConversationFilter.UNREAD))

        assertThat(content).isEqualTo(ConversationListContent.FilteredEmpty)
    }

    @Test
    fun `a non-blank search matching nothing renders the filtered-empty message`() {
        val content = ConversationListContent.of(state(searchText = "zzz"))

        assertThat(content).isEqualTo(ConversationListContent.FilteredEmpty)
    }

    @Test
    fun `a blank search on the ALL filter is a cold-empty account, not filtered`() {
        val content = ConversationListContent.of(state(searchText = "   "))

        assertThat(content).isEqualTo(ConversationListContent.ColdEmpty)
    }

    @Test
    fun `an empty account with no filter and no error renders the cold-empty message`() {
        assertThat(ConversationListContent.of(state()))
            .isEqualTo(ConversationListContent.ColdEmpty)
    }
}
