package me.meeshy.sdk.link

/**
 * A cached positive result: the renderable [metadata] and the epoch-ms instant it was fetched,
 * kept so a stale entry can be evicted by [LinkPreviewCache.evictStale]. iOS holds the timestamp
 * inside `LinkMetadata`; Android keeps `LinkMetadata` a pure parsing value type and pins the
 * retention clock here, where the cache owns TTL.
 */
public data class LinkPreviewEntry(
    val metadata: LinkMetadata,
    val fetchedAtMillis: Long,
)

/**
 * The decision the cache hands back for a URL lookup. The store/UI acts on exactly one arm, so the
 * "have we got it / did it fail / is it loading / go fetch" branching lives here once, not scattered
 * across imperative guards.
 */
public sealed interface LinkPreviewLookup {
    /** Renderable metadata is cached — show the card, do not fetch. */
    public data class Cached(val metadata: LinkMetadata) : LinkPreviewLookup

    /** A recent fetch failed and its negative window is still open — show the bare link, do not re-fetch. */
    public data object RecentlyFailed : LinkPreviewLookup

    /** A fetch for this URL is already in flight — wait, do not start another. */
    public data object InFlight : LinkPreviewLookup

    /** Nothing is known — the caller should start a fetch. */
    public data object ShouldFetch : LinkPreviewLookup
}

/**
 * The immutable dedupe / negative-cache / TTL / logout SSOT beneath the async OpenGraph fetch.
 *
 * iOS scatters this across `LinkPreviewStore`'s `cache` (positive), `negativeCache` (failed URLs
 * with a 30-min window) and `pendingKeys` (in-flight dedupe) maps plus the imperative
 * `requestMetadata` guards. Here it is one pure value type: every transition returns a new cache,
 * so the store just swaps a `StateFlow` value and the UI reads a pure projection.
 *
 * Keys are opaque URL strings — canonicalisation (tracker stripping so campaign-tagged variants
 * share one entry) is the store's job, keeping this type agnostic of what a "URL" means.
 */
public data class LinkPreviewCache(
    val entries: Map<String, LinkPreviewEntry> = emptyMap(),
    val failures: Map<String, Long> = emptyMap(),
    val inFlight: Set<String> = emptySet(),
) {

    /**
     * Resolves what to do for [url] at [nowMillis]. A present positive entry always wins; then a
     * still-fresh failure; then an in-flight marker; otherwise the caller should fetch. An expired
     * failure falls through to [LinkPreviewLookup.ShouldFetch] so a transient outage self-heals.
     */
    public fun lookup(url: String, nowMillis: Long): LinkPreviewLookup {
        entries[url]?.let { return LinkPreviewLookup.Cached(it.metadata) }
        failures[url]?.let { failedAt ->
            if (nowMillis - failedAt < NEGATIVE_TTL_MILLIS) return LinkPreviewLookup.RecentlyFailed
        }
        if (url in inFlight) return LinkPreviewLookup.InFlight
        return LinkPreviewLookup.ShouldFetch
    }

    /**
     * Projects [lookup] onto a [LinkPreviewOutcome] so the result feeds straight into
     * [LinkPreview.stateFor]. Both "unknown" and "in flight" are [LinkPreviewOutcome.Pending] (the
     * loading chip); a known failure is [LinkPreviewOutcome.Empty] (the bare-link fallback).
     */
    public fun outcomeFor(url: String, nowMillis: Long): LinkPreviewOutcome =
        when (val lookup = lookup(url, nowMillis)) {
            is LinkPreviewLookup.Cached -> LinkPreviewOutcome.Resolved(lookup.metadata)
            LinkPreviewLookup.RecentlyFailed -> LinkPreviewOutcome.Empty
            LinkPreviewLookup.InFlight -> LinkPreviewOutcome.Pending
            LinkPreviewLookup.ShouldFetch -> LinkPreviewOutcome.Pending
        }

    /** Marks [url] as being fetched. Idempotent — returns the same instance if already in flight. */
    public fun startFetch(url: String): LinkPreviewCache =
        if (url in inFlight) this else copy(inFlight = inFlight + url)

    /**
     * Applies a completed fetch [outcome] for [url] at [nowMillis], clearing the in-flight marker.
     * A success caches the metadata and forgets any prior failure; an empty result records the
     * negative timestamp; [LinkPreviewOutcome.Pending] is an inert no-op (a fetch is not "done").
     */
    public fun resolve(url: String, outcome: LinkPreviewOutcome, nowMillis: Long): LinkPreviewCache =
        when (outcome) {
            is LinkPreviewOutcome.Resolved -> copy(
                entries = entries + (url to LinkPreviewEntry(outcome.metadata, nowMillis)),
                failures = failures - url,
                inFlight = inFlight - url,
            )
            LinkPreviewOutcome.Empty -> copy(
                failures = failures + (url to nowMillis),
                inFlight = inFlight - url,
            )
            LinkPreviewOutcome.Pending -> this
        }

    /**
     * Drops positive entries older than [MAX_AGE_MILLIS] and negative entries past their window at
     * [nowMillis]. Mirrors iOS's load-time eviction (never serve metadata that predates a site
     * redesign by more than a week) and additionally prunes stale negatives so the failure map
     * cannot grow unbounded. Returns the same instance when nothing is stale.
     */
    public fun evictStale(nowMillis: Long): LinkPreviewCache {
        val liveEntries = entries.filterValues { nowMillis - it.fetchedAtMillis <= MAX_AGE_MILLIS }
        val liveFailures = failures.filterValues { nowMillis - it < NEGATIVE_TTL_MILLIS }
        if (liveEntries.size == entries.size && liveFailures.size == failures.size) return this
        return copy(entries = liveEntries, failures = liveFailures)
    }

    /** Empties every map — the logout purge so a device's next user can't read the previous one's links. */
    public fun cleared(): LinkPreviewCache = LinkPreviewCache()

    public companion object {
        /** Positive entries older than a week are evicted — a stale site redesign never lingers. */
        public const val MAX_AGE_MILLIS: Long = 7L * 24 * 3600 * 1000

        /** A failed URL is not re-hit for 30 minutes, so one 404 doesn't hammer the host on every scroll. */
        public const val NEGATIVE_TTL_MILLIS: Long = 30L * 60 * 1000
    }
}
