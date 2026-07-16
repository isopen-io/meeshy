package me.meeshy.app.chat

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.link.LinkPreviewCache
import me.meeshy.sdk.link.LinkPreviewFetcher
import me.meeshy.sdk.link.LinkPreviewLookup
import me.meeshy.sdk.link.LinkPreviewOutcome
import me.meeshy.sdk.link.LinkPreviewParser
import me.meeshy.sdk.link.OkHttpLinkPreviewFetcher

/**
 * App-side orchestration over the pure [LinkPreviewCache]: decides *when* to hit the network,
 * dedupes concurrent fetches, honours the negative window, and purges on logout — the Android
 * counterpart of iOS `LinkPreviewStore.requestMetadata`.
 *
 * SDK-purity grain: the reducer ([LinkPreviewCache]) and the fetch ([LinkPreviewFetcher]) are
 * stateless SDK building blocks; this store encodes the product rule ("fetch once, remember the
 * failure, forget everything on logout") and holds the live [StateFlow] the chat screen reads.
 *
 * URLs are canonicalised (tracker params stripped) before use, so a message linking
 * `…?utm_source=x` and one linking the bare URL resolve to the same cache entry and a single fetch.
 *
 * [request] is expected on the main thread (a Compose `LaunchedEffect`); the lookup-then-mark step
 * is therefore effectively atomic and two bubbles sharing a URL fetch it once.
 */
class LinkPreviewStore(
    private val scope: CoroutineScope,
    private val fetcher: LinkPreviewFetcher = OkHttpLinkPreviewFetcher(),
    private val clock: () -> Long = { System.currentTimeMillis() },
) {
    private val _cache = MutableStateFlow(LinkPreviewCache())

    /** The live cache. The chat screen collects this once and projects [LinkPreviewCache.outcomeFor] per bubble. */
    val cache: StateFlow<LinkPreviewCache> = _cache.asStateFlow()

    /** Kicks off a fetch for [rawUrl] only if it is unknown, not failed-recently, and not in flight. */
    fun request(rawUrl: String) {
        val key = LinkPreviewParser.canonicalize(rawUrl)
        if (_cache.value.lookup(key, clock()) !is LinkPreviewLookup.ShouldFetch) return
        _cache.update { it.startFetch(key) }
        scope.launch {
            val outcome = try {
                fetcher.fetch(key)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Throwable) {
                LinkPreviewOutcome.Empty
            }
            _cache.update { it.resolve(key, outcome, clock()) }
        }
    }

    /** The current outcome for [rawUrl], ready to feed [me.meeshy.sdk.link.LinkPreview.stateFor]. */
    fun outcomeFor(rawUrl: String): LinkPreviewOutcome =
        _cache.value.outcomeFor(LinkPreviewParser.canonicalize(rawUrl), clock())

    /** Purges the whole cache — call on logout so the next user cannot read the previous one's links. */
    fun clear() {
        _cache.update { it.cleared() }
    }
}
