package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CancellableContinuation
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.link.LinkMetadata
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewOutcome
import org.junit.Test

/**
 * Behavioural coverage of [LinkPreviewStore] — the app-side orchestration that owns the pure
 * [me.meeshy.sdk.link.LinkPreviewCache] and decides *when* to hit the network. Mirrors iOS
 * `LinkPreviewStore.requestMetadata`: fetch once, dedupe in-flight, honour the negative window,
 * purge on logout. Driven only through the public API against a fake fetcher.
 *
 * The store's coroutines run on an [UnconfinedTestDispatcher] so a non-gated fetch completes
 * eagerly; a [CompletableDeferred] `gate` holds a fetch open when a test needs to observe the
 * in-flight state before it resolves.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LinkPreviewStoreTest {

    private val rawUrl = "https://example.com/article"
    private fun metadata(id: String = rawUrl) = LinkMetadata(id = id, title = "T", description = "D")

    private fun TestScope.storeScope(): CoroutineScope = CoroutineScope(UnconfinedTestDispatcher(testScheduler))

    /** A fetcher whose result and gating the test controls, recording every call. */
    private class FakeFetcher(
        private var next: LinkPreviewOutcome = LinkPreviewOutcome.Empty,
    ) : LinkPreviewFetcher {
        val calls = mutableListOf<String>()
        var gate: CompletableDeferred<Unit>? = null
        fun willReturn(outcome: LinkPreviewOutcome) { next = outcome }
        override suspend fun fetch(url: String): LinkPreviewOutcome {
            calls += url
            gate?.await()
            return next
        }
    }

    private class MutableClock(var now: Long = 0) { fun read(): Long = now }

    @Test
    fun `a request for an unknown url fetches and caches the resolved metadata`() = runTest {
        val fetcher = FakeFetcher().apply { willReturn(LinkPreviewOutcome.Resolved(metadata())) }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)

        assertThat(fetcher.calls).containsExactly(rawUrl)
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Resolved(metadata()))
    }

    @Test
    fun `two requests before the first resolves fetch only once`() = runTest {
        val fetcher = FakeFetcher().apply {
            willReturn(LinkPreviewOutcome.Resolved(metadata()))
            gate = CompletableDeferred()
        }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)
        store.request(rawUrl)
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Pending)
        fetcher.gate!!.complete(Unit)
        runCurrent()

        assertThat(fetcher.calls).hasSize(1)
    }

    @Test
    fun `a request for an already-cached url does not fetch again`() = runTest {
        val fetcher = FakeFetcher().apply { willReturn(LinkPreviewOutcome.Resolved(metadata())) }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)
        store.request(rawUrl)

        assertThat(fetcher.calls).hasSize(1)
    }

    @Test
    fun `an empty result is negatively cached and not re-fetched within the window`() = runTest {
        val fetcher = FakeFetcher().apply { willReturn(LinkPreviewOutcome.Empty) }
        val clock = MutableClock(now = 0)
        val store = LinkPreviewStore(storeScope(), fetcher, clock::read)

        store.request(rawUrl)
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Empty)

        store.request(rawUrl)
        assertThat(fetcher.calls).hasSize(1)
    }

    @Test
    fun `a negatively cached url is re-fetched after the window expires`() = runTest {
        val fetcher = FakeFetcher().apply { willReturn(LinkPreviewOutcome.Empty) }
        val clock = MutableClock(now = 0)
        val store = LinkPreviewStore(storeScope(), fetcher, clock::read)

        store.request(rawUrl)

        clock.now = 30L * 60 * 1000
        store.request(rawUrl)

        assertThat(fetcher.calls).hasSize(2)
    }

    @Test
    fun `a fetcher failure degrades gracefully to an empty outcome`() = runTest {
        val fetcher = object : LinkPreviewFetcher {
            var calls = 0
            override suspend fun fetch(url: String): LinkPreviewOutcome {
                calls++
                throw java.io.IOException("boom")
            }
        }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)

        assertThat(fetcher.calls).isEqualTo(1)
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `a cancelled fetch is not recorded as a failure`() = runTest {
        val started = CompletableDeferred<CancellableContinuation<LinkPreviewOutcome>>()
        val fetcher = object : LinkPreviewFetcher {
            override suspend fun fetch(url: String): LinkPreviewOutcome =
                suspendCancellableCoroutine { cont -> started.complete(cont) }
        }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)
        val cont = started.await()
        cont.cancel()
        runCurrent()

        // Cancellation must propagate, not be swallowed as a negative entry: the url stays
        // fetchable (Pending — the in-flight marker — never RecentlyFailed).
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Pending)
    }

    @Test
    fun `campaign-tagged variants of the same url share a single fetch`() = runTest {
        val fetcher = FakeFetcher().apply {
            willReturn(LinkPreviewOutcome.Resolved(metadata(id = "https://example.com/article")))
            gate = CompletableDeferred()
        }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request("https://example.com/article?utm_source=newsletter")
        store.request("https://example.com/article?utm_campaign=spring")
        fetcher.gate!!.complete(Unit)
        runCurrent()

        assertThat(fetcher.calls).containsExactly("https://example.com/article")
    }

    @Test
    fun `clear purges the cache so a logged-out session leaks nothing`() = runTest {
        val fetcher = FakeFetcher().apply { willReturn(LinkPreviewOutcome.Resolved(metadata())) }
        val store = LinkPreviewStore(storeScope(), fetcher) { 0 }

        store.request(rawUrl)
        assertThat(store.outcomeFor(rawUrl)).isInstanceOf(LinkPreviewOutcome.Resolved::class.java)

        store.clear()

        assertThat(store.cache.value.entries).isEmpty()
        assertThat(store.outcomeFor(rawUrl)).isEqualTo(LinkPreviewOutcome.Pending)
    }
}
