package me.meeshy.sdk.share

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.share.ShareCommunity
import me.meeshy.sdk.model.share.ShareSearchResults
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ShareRecipientSearchSessionTest {

    private fun answer(name: String) = ShareSearchResults(communities = listOf(ShareCommunity(name, name, null)))

    @Test
    fun `a single character publishes the text but never asks the server`() = runTest {
        val asked = mutableListOf<String>()
        val session = ShareRecipientSearchSession({ asked += it; ShareSearchResults.EMPTY })
        session.onQuery("a")
        advanceUntilIdle()
        assertThat(asked).isEmpty()
        assertThat(session.state.value.query).isEqualTo("a")
        assertThat(session.state.value.results).isNull()
    }

    @Test
    fun `the server is asked only after 300 ms without a new keystroke`() = runTest {
        val asked = mutableListOf<String>()
        val session = ShareRecipientSearchSession({ asked += it; answer(it) })
        val job = launch { session.onQuery("lea") }
        advanceTimeBy(299)
        assertThat(asked).isEmpty()
        assertThat(session.state.value.query).isEqualTo("lea")
        advanceUntilIdle()
        job.join()
        assertThat(asked).containsExactly("lea")
        assertThat(session.state.value.results).isEqualTo(answer("lea"))
    }

    @Test
    fun `a keystroke inside the debounce replaces the pending search`() = runTest {
        val asked = mutableListOf<String>()
        val session = ShareRecipientSearchSession({ asked += it; answer(it) })
        launch { session.onQuery("le") }
        advanceTimeBy(100)
        launch { session.onQuery("lea") }
        advanceUntilIdle()
        assertThat(asked).containsExactly("lea")
    }

    @Test
    fun `a stale answer is rejected when a newer query has started`() = runTest {
        val slow = CompletableDeferred<ShareSearchResults>()
        val session = ShareRecipientSearchSession({ if (it == "old") slow.await() else answer(it) })
        launch { session.onQuery("old") }
        advanceTimeBy(301)
        launch { session.onQuery("new") }
        advanceUntilIdle()
        slow.complete(answer("old"))
        advanceUntilIdle()
        assertThat(session.state.value.results).isEqualTo(answer("new"))
    }

    @Test
    fun `clearing the text drops the server results and a late answer does not bring them back`() = runTest {
        val slow = CompletableDeferred<ShareSearchResults>()
        val session = ShareRecipientSearchSession({ slow.await() })
        launch { session.onQuery("lea") }
        advanceTimeBy(301)
        session.onQuery("")
        slow.complete(answer("lea"))
        advanceUntilIdle()
        assertThat(session.state.value.results).isNull()
        assertThat(session.state.value.query).isEmpty()
    }
}
