package me.meeshy.sdk.cache

import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.FlowCollector
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.scan
import kotlinx.coroutines.withContext
import me.meeshy.sdk.model.cache.LoadEvent
import me.meeshy.sdk.model.cache.LoadFailure
import me.meeshy.sdk.model.cache.LoadState
import me.meeshy.sdk.model.cache.LoadStateReducer
import me.meeshy.sdk.net.NetworkResult

/**
 * What a cache-first load tells its screen — the two callbacks of iOS `CacheFirstLoader`
 * (`apply` and `setLoadState`) serialised into one stream.
 *
 * [Items] repaints the list together with the state that goes with it (one atomic change, no
 * frame where the items and the state disagree). [State] changes only the state: a failure
 * is always a [State], so it can never erase what is painted.
 */
sealed interface CacheFirstEvent<out V> {
    data class Items<out V>(val items: List<V>, val loadState: LoadState) : CacheFirstEvent<V>

    data class State(val loadState: LoadState) : CacheFirstEvent<Nothing>
}

/** The screen-side fold of [CacheFirstEvent]: the painted items and the [LoadState] that goes with them. */
data class CacheFirstState<V>(
    val items: List<V> = emptyList(),
    val loadState: LoadState = LoadState.Idle,
) {
    fun reduce(event: CacheFirstEvent<V>): CacheFirstState<V> = when (event) {
        is CacheFirstEvent.Items -> CacheFirstState(event.items, event.loadState)
        is CacheFirstEvent.State -> copy(loadState = event.loadState)
    }
}

fun <V> Flow<CacheFirstEvent<V>>.toStates(
    initial: CacheFirstState<V> = CacheFirstState(),
): Flow<CacheFirstState<V>> = scan(initial) { state, event -> state.reduce(event) }

/**
 * The cache-first / stale-while-revalidate load of one keyed list — the Android port of iOS
 * `CacheFirstLoader` (`Cache/CacheFirstLoader.swift`).
 *
 * [load] is the cold-start path:
 * - **Fresh** cache: painted as `CachedFresh`, the network is never asked.
 * - **Stale** cache: painted as `CachedStale` at once, then revalidated SILENTLY — a failure
 *   there never shows an error, at most the discreet `Offline` hint.
 * - **Expired** cache (or an entry the store dropped): the last known items are repainted
 *   (`loadIgnoringExpiry`) as `CachedStale` rather than an empty screen, then revalidated.
 * - **Nothing to paint**: `Loading` — the only state that shows a skeleton — then the fetch.
 *
 * [refresh] is the explicit pull-to-refresh path: it skips the cache and forces the network.
 * Keeping it apart from [load] is the point — a refresh wired on [load] would hit no network over
 * a fresh cache and would hand control back before the revalidation ended.
 *
 * Both are cold flows: collecting runs the work, and cancelling the collector (the screen left)
 * cancels the revalidation in flight with it. A network failure (`ApiError.code == "NETWORK"`,
 * or a thrown [IOException]) is `Offline`, never `Error`; a persistence failure is reported to
 * [onCacheError] and never regresses the state already painted.
 */
class CacheFirstLoader<K : Any, V>(
    private val store: MutableCacheStore<K, V>,
    private val key: K,
    private val onCacheError: (Throwable) -> Unit = {},
) {

    fun load(fetch: suspend () -> NetworkResult<List<V>>): Flow<CacheFirstEvent<V>> = flow {
        when (val cached = readCache()) {
            is CacheResult.Fresh -> emit(paint(LoadState.Idle, LoadEvent.CacheFreshPainted, cached.value))
            is CacheResult.Stale -> {
                val painted = paint(LoadState.Idle, LoadEvent.CacheStalePainted, cached.value)
                emit(painted)
                settle(painted.loadState, silent = true, fetch)
            }
            is CacheResult.Syncing -> loadExpired(cached.value, fetch)
            CacheResult.Empty -> loadExpired(null, fetch)
        }
    }

    fun refresh(fetch: suspend () -> NetworkResult<List<V>>): Flow<CacheFirstEvent<V>> = flow {
        settle(LoadState.Idle, silent = false, fetch)
    }

    private suspend fun FlowCollector<CacheFirstEvent<V>>.loadExpired(
        expired: List<V>?,
        fetch: suspend () -> NetworkResult<List<V>>,
    ) {
        val lastKnown = expired?.takeIf { it.isNotEmpty() } ?: recoverLastKnown()
        if (lastKnown == null) {
            val loading = LoadStateReducer.reduce(LoadState.Idle, LoadEvent.CacheMissed)
            emit(CacheFirstEvent.State(loading))
            settle(loading, silent = false, fetch)
            return
        }
        val painted = paint(LoadState.Idle, LoadEvent.CacheStalePainted, lastKnown)
        emit(painted)
        settle(painted.loadState, silent = false, fetch)
    }

    private suspend fun FlowCollector<CacheFirstEvent<V>>.settle(
        from: LoadState,
        silent: Boolean,
        fetch: suspend () -> NetworkResult<List<V>>,
    ) {
        when (val outcome = fetchSafely(fetch)) {
            is Fetched.Items -> {
                val loaded = paint(from, LoadEvent.FetchSucceeded, outcome.items)
                try {
                    emit(loaded)
                } finally {
                    persist(outcome.items)
                }
            }
            is Fetched.Failure -> {
                val event = if (silent) LoadEvent.RevalidationFailed(outcome.failure) else LoadEvent.FetchFailed(outcome.failure)
                val next = LoadStateReducer.reduce(from, event)
                if (next != from) emit(CacheFirstEvent.State(next))
            }
        }
    }

    private fun paint(from: LoadState, event: LoadEvent, items: List<V>): CacheFirstEvent.Items<V> =
        CacheFirstEvent.Items(items, LoadStateReducer.reduce(from, event))

    private suspend fun readCache(): CacheResult<List<V>> = try {
        store.load(key)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        onCacheError(e)
        CacheResult.Empty
    }

    private suspend fun recoverLastKnown(): List<V>? = try {
        store.loadIgnoringExpiry(key)?.items?.takeIf { it.isNotEmpty() }
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        onCacheError(e)
        null
    }

    // The fetched payload is already in hand: it is persisted even if the screen left between
    // the paint and the write, and a failed write never reaches the state (iOS keeps the save
    // outside the `do` of the fetch for the same reason).
    private suspend fun persist(items: List<V>) = withContext(NonCancellable) {
        try {
            store.save(items, key)
        } catch (e: Exception) {
            onCacheError(e)
        }
    }

    private suspend fun fetchSafely(fetch: suspend () -> NetworkResult<List<V>>): Fetched<V> = try {
        when (val result = fetch()) {
            is NetworkResult.Success -> Fetched.Items(result.data)
            is NetworkResult.Failure ->
                Fetched.Failure(LoadFailure.fromErrorCode(result.error.code, result.error.message))
        }
    } catch (e: CancellationException) {
        throw e
    } catch (e: IOException) {
        Fetched.Failure(LoadFailure.Offline)
    } catch (e: Exception) {
        Fetched.Failure(LoadFailure.Failed(e.message ?: e.javaClass.simpleName))
    }

    private sealed interface Fetched<out T> {
        data class Items<T>(val items: List<T>) : Fetched<T>
        data class Failure(val failure: LoadFailure) : Fetched<Nothing>
    }
}
