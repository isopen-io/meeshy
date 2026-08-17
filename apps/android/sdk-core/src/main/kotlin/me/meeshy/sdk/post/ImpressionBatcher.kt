package me.meeshy.sdk.post

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import me.meeshy.sdk.net.NetworkResult

/**
 * Groups a feed surface's post impressions into small batches before sending them
 * (feature-parity §F) — port of iOS `ImpressionBatcher`'s debounce/flush/retry core. An
 * impression is counted per APPEARANCE: [record] simply appends, never deduplicates — a post
 * scrolled past twice in one session counts twice, matching the gateway's own batch-`updateMany`
 * semantics.
 *
 * One instance per surface (owned by that surface's ViewModel, e.g. `source = "feed"`), not a
 * Hilt singleton — mirrors iOS's per-view `@StateObject` lifetime. [scope] defaults to its OWN
 * independent `SupervisorJob`, deliberately NOT `viewModelScope`: a `ViewModel.onCleared()` call
 * to [flushNowAsync] would otherwise race its own cancellation (`viewModelScope` is torn down
 * right after `onCleared()` returns), likely dropping the very flush it's meant to guarantee.
 *
 * Narrower than iOS's own three safety nets for now: the debounced auto-flush and [flushNow]
 * (leaving the screen) are ported; app-backgrounding flush and kill-survival persistence (iOS:
 * UserDefaults, replayed on relaunch) are NOT — Android has no equivalent wiring point yet for
 * either, left open rather than invented under this slice's scope.
 */
class ImpressionBatcher(
    private val source: String,
    private val postRepository: PostRepository,
    private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
    private val flushDelayMillis: Long = 3_000L,
) {
    private val pending = mutableListOf<String>()
    private var flushJob: Job? = null

    /** [postId] just appeared on screen. */
    fun record(postId: String) {
        if (postId.isEmpty()) return
        pending.add(postId)
        scheduleFlush()
    }

    /** Sends whatever is pending immediately — call when the surface disappears. */
    suspend fun flushNow() {
        flushJob?.cancel()
        flushJob = null
        flush()
    }

    /** Fire-and-forget [flushNow], for non-suspend call sites like `ViewModel.onCleared()`. */
    fun flushNowAsync() {
        scope.launch { flushNow() }
    }

    private fun scheduleFlush() {
        flushJob?.cancel()
        flushJob = scope.launch {
            delay(flushDelayMillis)
            flush()
        }
    }

    private suspend fun flush() {
        if (pending.isEmpty()) return
        val batch = pending.toList()
        // Cleared BEFORE the network call so a concurrent `record` doesn't land in the
        // in-flight batch and get lost if the call succeeds; reinserted at the front on
        // failure so a retry sends the original occurrences first.
        pending.clear()
        val result = postRepository.recordImpressions(batch, source)
        if (result is NetworkResult.Failure) {
            pending.addAll(0, batch)
        }
    }
}
