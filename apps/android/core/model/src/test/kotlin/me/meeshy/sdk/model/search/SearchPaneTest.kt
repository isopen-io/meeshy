package me.meeshy.sdk.model.search

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SearchPaneTest {

    private val down = SearchPane<String>(failure = SearchPaneFailure.Unreachable)
    private fun served(vararg items: String) = SearchPane(items.toList())

    @Test
    fun `a failed pane is never presented as an empty one`() {
        assertThat(down.isFailed).isTrue()
        assertThat(down.items).isEmpty()
        assertThat(served().isFailed).isFalse()
    }

    @Test
    fun `failures are reported in priority order conversations then people then messages`() {
        val all = SearchPanes.firstFailure(
            conversations = SearchPane<String>(failure = SearchPaneFailure.Unreachable),
            people = SearchPane<String>(failure = SearchPaneFailure.Unreachable),
            messages = SearchPane<String>(failure = SearchPaneFailure.Unreachable),
        )
        assertThat(all).isEqualTo(SearchPaneKind.CONVERSATIONS)

        val peopleAndMessages = SearchPanes.firstFailure(served("c"), down, down)
        assertThat(peopleAndMessages).isEqualTo(SearchPaneKind.PEOPLE)

        val messagesOnly = SearchPanes.firstFailure(served("c"), served("p"), down)
        assertThat(messagesOnly).isEqualTo(SearchPaneKind.MESSAGES)

        assertThat(SearchPanes.firstFailure(served("c"), served(), served())).isNull()
    }

    @Test
    fun `hasDisplayedResults counts every family`() {
        assertThat(SearchPanes.hasDisplayedResults(served(), served(), served())).isFalse()
        assertThat(SearchPanes.hasDisplayedResults(served("c"), served(), served())).isTrue()
        assertThat(SearchPanes.hasDisplayedResults(served(), served("p"), served())).isTrue()
        assertThat(SearchPanes.hasDisplayedResults(served(), served(), served("m"))).isTrue()
    }

    @Test
    fun `a cold start with nothing on screen is loading`() {
        assertThat(SearchLoadStates.starting(hasCachedHit = false, hasDisplayedResults = false))
            .isEqualTo(SearchLoadState.LOADING)
    }

    @Test
    fun `a spinner never replaces results already displayed or cached`() {
        assertThat(SearchLoadStates.starting(hasCachedHit = true, hasDisplayedResults = false))
            .isEqualTo(SearchLoadState.CACHED_STALE)
        assertThat(SearchLoadStates.starting(hasCachedHit = false, hasDisplayedResults = true))
            .isEqualTo(SearchLoadState.CACHED_STALE)
    }

    @Test
    fun `offline wins over any failure`() {
        assertThat(SearchLoadStates.settled(offline = true, failure = SearchPaneKind.PEOPLE, hasDisplayedResults = false))
            .isEqualTo(SearchLoadState.OFFLINE)
    }

    @Test
    fun `a failure with nothing to show is an error but with results it stays loaded`() {
        assertThat(SearchLoadStates.settled(offline = false, failure = SearchPaneKind.MESSAGES, hasDisplayedResults = false))
            .isEqualTo(SearchLoadState.ERROR)
        assertThat(SearchLoadStates.settled(offline = false, failure = SearchPaneKind.MESSAGES, hasDisplayedResults = true))
            .isEqualTo(SearchLoadState.LOADED)
        assertThat(SearchLoadStates.settled(offline = false, failure = null, hasDisplayedResults = false))
            .isEqualTo(SearchLoadState.LOADED)
    }
}
