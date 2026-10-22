package me.meeshy.sdk.model.cache

/**
 * Why a fetch failed, already classified into the only distinction the screen cares about:
 * the network is unreachable ([Offline]) or the gateway refused ([Failed]).
 */
public sealed interface LoadFailure {
    public data object Offline : LoadFailure
    public data class Failed(val message: String) : LoadFailure

    public companion object {
        /** `ApiError.code` ApiCall stamps on every transport failure (no connectivity, timeout, DNS). */
        public const val NETWORK_CODE: String = "NETWORK"

        /** A transport failure is [Offline]; anything the gateway said is [Failed]. */
        public fun fromErrorCode(code: String?, message: String): LoadFailure =
            if (code == NETWORK_CODE) Offline else Failed(message)
    }
}

/** What happened to a cache-first load, in the order the loader observes it. */
public sealed interface LoadEvent {
    /** The cache held data inside its fresh window and it was painted. */
    public data object CacheFreshPainted : LoadEvent

    /** The cache held stale or expired data and it was painted (a revalidation follows). */
    public data object CacheStalePainted : LoadEvent

    /** The cache had nothing to paint: cold start. */
    public data object CacheMissed : LoadEvent

    public data object FetchSucceeded : LoadEvent

    /** A foreground fetch failed: cold start, expired cache, or an explicit pull-to-refresh. */
    public data class FetchFailed(val failure: LoadFailure) : LoadEvent

    /** The silent revalidation of an already painted cache failed. */
    public data class RevalidationFailed(val failure: LoadFailure) : LoadEvent

    /** Back to the start (account switch, screen reset). */
    public data object Reset : LoadEvent
}

/**
 * The single transition function of [LoadState]. Pure: the loader feeds it events, the
 * screen renders the state.
 *
 * Two laws hold for every state:
 *  1. A network failure is [LoadState.Offline], never [LoadState.Error].
 *  2. A silent revalidation never regresses what is on screen: over a painted cache it can
 *     only add the discreet [LoadState.Offline] hint, and once the screen is
 *     [LoadState.Loaded] it changes nothing at all.
 */
public object LoadStateReducer {

    public fun reduce(state: LoadState, event: LoadEvent): LoadState = when (event) {
        LoadEvent.CacheFreshPainted -> LoadState.CachedFresh
        LoadEvent.CacheStalePainted -> LoadState.CachedStale
        LoadEvent.CacheMissed -> LoadState.Loading
        LoadEvent.FetchSucceeded -> LoadState.Loaded
        is LoadEvent.FetchFailed -> failed(event.failure)
        is LoadEvent.RevalidationFailed -> revalidationFailed(state, event.failure)
        LoadEvent.Reset -> LoadState.Idle
    }

    private fun failed(failure: LoadFailure): LoadState = when (failure) {
        LoadFailure.Offline -> LoadState.Offline
        is LoadFailure.Failed -> LoadState.Error(failure.message)
    }

    private fun revalidationFailed(state: LoadState, failure: LoadFailure): LoadState {
        val overPaintedCache = state == LoadState.CachedStale || state == LoadState.CachedFresh
        return if (overPaintedCache && failure == LoadFailure.Offline) LoadState.Offline else state
    }
}
