package me.meeshy.sdk.link

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [LinkPreviewCache] — the pure dedupe / negative-cache / TTL / logout
 * SSOT beneath the async OpenGraph fetch. iOS scatters this across `LinkPreviewStore`'s
 * `cache` / `negativeCache` / `pendingKeys` maps + the imperative `requestMetadata` guards; here
 * it is one immutable value type with pure transitions, driven only through its public API.
 */
class LinkPreviewCacheTest {

    private val url = "https://example.com/article"
    private val other = "https://other.com/x"

    private fun metadata(id: String = url) = LinkMetadata(id = id, title = "Title", description = "Desc")

    // --- lookup -------------------------------------------------------------

    @Test
    fun `lookup on an empty cache asks to fetch`() {
        assertThat(LinkPreviewCache().lookup(url, nowMillis = 0))
            .isEqualTo(LinkPreviewLookup.ShouldFetch)
    }

    @Test
    fun `lookup serves cached metadata without a fetch`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        assertThat(cache.lookup(url, nowMillis = 1_000))
            .isEqualTo(LinkPreviewLookup.Cached(metadata()))
    }

    @Test
    fun `lookup reports a recent failure as recently-failed`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        assertThat(cache.lookup(url, nowMillis = LinkPreviewCache.NEGATIVE_TTL_MILLIS - 1))
            .isEqualTo(LinkPreviewLookup.RecentlyFailed)
    }

    @Test
    fun `lookup lets an expired failure fall through to a fresh fetch`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        assertThat(cache.lookup(url, nowMillis = LinkPreviewCache.NEGATIVE_TTL_MILLIS))
            .isEqualTo(LinkPreviewLookup.ShouldFetch)
    }

    @Test
    fun `lookup reports an in-flight fetch`() {
        val cache = LinkPreviewCache().startFetch(url)
        assertThat(cache.lookup(url, nowMillis = 0)).isEqualTo(LinkPreviewLookup.InFlight)
    }

    @Test
    fun `a cached entry wins over an in-flight marker`() {
        val cache = LinkPreviewCache()
            .startFetch(url)
            .resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        assertThat(cache.lookup(url, nowMillis = 0))
            .isEqualTo(LinkPreviewLookup.Cached(metadata()))
    }

    // --- outcomeFor (bridge to the LinkPreview state machine) ---------------

    @Test
    fun `outcomeFor maps a cached entry to Resolved`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        assertThat(cache.outcomeFor(url, nowMillis = 0))
            .isEqualTo(LinkPreviewOutcome.Resolved(metadata()))
    }

    @Test
    fun `outcomeFor maps a recent failure to Empty`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        assertThat(cache.outcomeFor(url, nowMillis = 0)).isEqualTo(LinkPreviewOutcome.Empty)
    }

    @Test
    fun `outcomeFor maps an in-flight fetch to Pending`() {
        val cache = LinkPreviewCache().startFetch(url)
        assertThat(cache.outcomeFor(url, nowMillis = 0)).isEqualTo(LinkPreviewOutcome.Pending)
    }

    @Test
    fun `outcomeFor maps an unknown url to Pending`() {
        assertThat(LinkPreviewCache().outcomeFor(url, nowMillis = 0)).isEqualTo(LinkPreviewOutcome.Pending)
    }

    // --- startFetch ---------------------------------------------------------

    @Test
    fun `startFetch marks the url in flight`() {
        assertThat(LinkPreviewCache().startFetch(url).inFlight).containsExactly(url)
    }

    @Test
    fun `startFetch is idempotent for an already in-flight url`() {
        val once = LinkPreviewCache().startFetch(url)
        assertThat(once.startFetch(url)).isSameInstanceAs(once)
    }

    // --- resolve ------------------------------------------------------------

    @Test
    fun `resolve with Resolved caches the metadata and clears the in-flight marker`() {
        val cache = LinkPreviewCache().startFetch(url)
            .resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 5)
        assertThat(cache.inFlight).isEmpty()
        assertThat(cache.entries[url]).isEqualTo(LinkPreviewEntry(metadata(), fetchedAtMillis = 5))
    }

    @Test
    fun `resolve with Empty records a negative entry and clears the in-flight marker`() {
        val cache = LinkPreviewCache().startFetch(url)
            .resolve(url, LinkPreviewOutcome.Empty, nowMillis = 7)
        assertThat(cache.inFlight).isEmpty()
        assertThat(cache.entries).doesNotContainKey(url)
        assertThat(cache.failures[url]).isEqualTo(7)
    }

    @Test
    fun `a success after a prior failure clears the negative entry`() {
        val cache = LinkPreviewCache()
            .resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
            .resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 1)
        assertThat(cache.failures).doesNotContainKey(url)
        assertThat(cache.lookup(url, nowMillis = 1)).isEqualTo(LinkPreviewLookup.Cached(metadata()))
    }

    @Test
    fun `resolve with Pending is an inert no-op`() {
        val cache = LinkPreviewCache().startFetch(url)
        assertThat(cache.resolve(url, LinkPreviewOutcome.Pending, nowMillis = 9)).isSameInstanceAs(cache)
    }

    // --- evictStale ---------------------------------------------------------

    @Test
    fun `evictStale drops a positive entry older than the max age`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        val pruned = cache.evictStale(nowMillis = LinkPreviewCache.MAX_AGE_MILLIS + 1)
        assertThat(pruned.entries).doesNotContainKey(url)
    }

    @Test
    fun `evictStale keeps a positive entry exactly at the max age boundary`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        val pruned = cache.evictStale(nowMillis = LinkPreviewCache.MAX_AGE_MILLIS)
        assertThat(pruned.entries).containsKey(url)
    }

    @Test
    fun `evictStale drops an expired negative entry`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        val pruned = cache.evictStale(nowMillis = LinkPreviewCache.NEGATIVE_TTL_MILLIS)
        assertThat(pruned.failures).doesNotContainKey(url)
    }

    @Test
    fun `evictStale keeps a still-valid negative entry`() {
        val cache = LinkPreviewCache().resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        val pruned = cache.evictStale(nowMillis = LinkPreviewCache.NEGATIVE_TTL_MILLIS - 1)
        assertThat(pruned.failures).containsKey(url)
    }

    @Test
    fun `evictStale returns the same instance when nothing is stale`() {
        val cache = LinkPreviewCache()
            .resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
            .resolve(other, LinkPreviewOutcome.Empty, nowMillis = 0)
        assertThat(cache.evictStale(nowMillis = 10)).isSameInstanceAs(cache)
    }

    // --- cleared (logout purge) ---------------------------------------------

    @Test
    fun `cleared purges every positive, negative and in-flight entry`() {
        val cache = LinkPreviewCache()
            .resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
            .resolve(other, LinkPreviewOutcome.Empty, nowMillis = 0)
            .startFetch("https://third.com")
        val cleared = cache.cleared()
        assertThat(cleared.entries).isEmpty()
        assertThat(cleared.failures).isEmpty()
        assertThat(cleared.inFlight).isEmpty()
    }

    // --- immutability -------------------------------------------------------

    @Test
    fun `transitions never mutate the receiver`() {
        val cache = LinkPreviewCache()
        cache.startFetch(url)
        cache.resolve(url, LinkPreviewOutcome.Resolved(metadata()), nowMillis = 0)
        cache.resolve(url, LinkPreviewOutcome.Empty, nowMillis = 0)
        cache.evictStale(nowMillis = Long.MAX_VALUE)
        cache.cleared()
        assertThat(cache).isEqualTo(LinkPreviewCache())
    }
}
