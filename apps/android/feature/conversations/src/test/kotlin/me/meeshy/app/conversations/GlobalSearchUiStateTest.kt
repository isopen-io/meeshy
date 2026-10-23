package me.meeshy.app.conversations

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.search.SearchLoadState
import me.meeshy.sdk.model.search.SearchPaneKind
import me.meeshy.sdk.net.api.UserSearchResult
import me.meeshy.sdk.search.GlobalSearchResults
import org.junit.Test

class GlobalSearchUiStateTest {

    private fun state(
        loadState: SearchLoadState = SearchLoadState.LOADED,
        hasSearched: Boolean = true,
        recents: List<String> = emptyList(),
        users: List<UserSearchResult> = emptyList(),
        failure: SearchPaneKind? = null,
        failedPanes: Set<SearchPaneKind> = emptySet(),
        tab: GlobalSearchTab = GlobalSearchTab.USERS,
    ) = GlobalSearchUiState(
        loadState = loadState,
        hasSearched = hasSearched,
        recentSearches = recents,
        results = GlobalSearchResults(users = users),
        failure = failure,
        failedPanes = failedPanes,
        selectedTab = tab,
    )

    private val oneUser = listOf(UserSearchResult(id = "u1", username = "belva"))

    @Test
    fun `before any search the recent searches are listed when there are some`() {
        assertThat(state(hasSearched = false, loadState = SearchLoadState.IDLE, recents = listOf("belva")).screenContent())
            .isEqualTo(GlobalSearchContent.RECENTS)
    }

    @Test
    fun `before any search with no history the initial prompt is shown`() {
        assertThat(state(hasSearched = false, loadState = SearchLoadState.IDLE).screenContent())
            .isEqualTo(GlobalSearchContent.INITIAL)
    }

    @Test
    fun `a cold search shows the searching state`() {
        assertThat(state(loadState = SearchLoadState.LOADING).screenContent())
            .isEqualTo(GlobalSearchContent.SEARCHING)
    }

    @Test
    fun `offline with nothing to show asks for the connection and offers a retry`() {
        assertThat(state(loadState = SearchLoadState.OFFLINE).screenContent())
            .isEqualTo(GlobalSearchContent.OFFLINE)
    }

    @Test
    fun `an error with nothing to show offers a retry`() {
        assertThat(state(loadState = SearchLoadState.ERROR, failure = SearchPaneKind.PEOPLE).screenContent())
            .isEqualTo(GlobalSearchContent.ERROR)
    }

    @Test
    fun `a failed pane is never reported as no results`() {
        val s = state(failure = SearchPaneKind.PEOPLE, failedPanes = setOf(SearchPaneKind.PEOPLE))
        assertThat(s.screenContent()).isEqualTo(GlobalSearchContent.ERROR)
    }

    @Test
    fun `a settled search with an empty tab and no failed pane is no results`() {
        assertThat(state().screenContent()).isEqualTo(GlobalSearchContent.NO_RESULTS)
    }

    @Test
    fun `offline with cached results keeps the list and flags a partial banner`() {
        val s = state(loadState = SearchLoadState.OFFLINE, users = oneUser)
        assertThat(s.screenContent()).isEqualTo(GlobalSearchContent.RESULTS)
        assertThat(s.showsPartialBanner).isTrue()
    }

    @Test
    fun `a failed sibling pane with results keeps the list and flags a partial banner`() {
        val s = state(users = oneUser, failure = SearchPaneKind.MESSAGES, failedPanes = setOf(SearchPaneKind.MESSAGES))
        assertThat(s.screenContent()).isEqualTo(GlobalSearchContent.RESULTS)
        assertThat(s.showsPartialBanner).isTrue()
    }

    @Test
    fun `revalidating a cached result never replaces the list and has no banner`() {
        val s = state(loadState = SearchLoadState.CACHED_STALE, users = oneUser)
        assertThat(s.screenContent()).isEqualTo(GlobalSearchContent.RESULTS)
        assertThat(s.isRevalidating).isTrue()
        assertThat(s.showsPartialBanner).isFalse()
    }

    @Test
    fun `a revalidation over an empty tab is not yet a verdict`() {
        assertThat(state(loadState = SearchLoadState.CACHED_STALE).screenContent())
            .isEqualTo(GlobalSearchContent.NO_RESULTS)
    }
}
