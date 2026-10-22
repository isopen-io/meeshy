package me.meeshy.sdk.model.cache

/**
 * High-level state of a screen that loads data through the cache-first pipeline — the
 * Android mirror of iOS `LoadState` (`Cache/LoadState.swift`). It says what the screen
 * must render, never what is in the list: the items live beside it, and no state change
 * ever erases them.
 *
 * - [Idle]        — nothing asked yet.
 * - [CachedFresh] — cache painted, inside its fresh window, no network needed.
 * - [CachedStale] — cache painted, a silent revalidation is (or was) in flight. The
 *                   workhorse case: "no spinner when the cache has data".
 * - [Loading]     — cold start with NOTHING paintable: the only state that shows a skeleton.
 * - [Loaded]      — the network answered and the result is painted.
 * - [Offline]     — the network is unreachable. A discreet hint, never an error screen:
 *                   whatever was painted stays painted.
 * - [Error]       — the gateway answered with a failure. Never produced by a network outage.
 */
public sealed interface LoadState {
    public data object Idle : LoadState
    public data object CachedStale : LoadState
    public data object CachedFresh : LoadState
    public data object Loading : LoadState
    public data object Loaded : LoadState
    public data object Offline : LoadState
    public data class Error(val message: String) : LoadState
}
