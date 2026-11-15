package me.meeshy.sdk.model.cache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec of the cache-first load state machine, the Android mirror of iOS
 * `LoadState` + the transitions `CacheFirstLoader` drives. The headline laws:
 *  - a network failure is [LoadState.Offline], NEVER [LoadState.Error];
 *  - a silent revalidation that fails never regresses what is already on screen.
 */
class LoadStateReducerTest {

    private fun reduce(state: LoadState, event: LoadEvent): LoadState =
        LoadStateReducer.reduce(state, event)

    private val offline = LoadFailure.Offline
    private val serverError = LoadFailure.Failed("Internal error")

    private val everyState: List<LoadState> = listOf(
        LoadState.Idle,
        LoadState.CachedStale,
        LoadState.CachedFresh,
        LoadState.Loading,
        LoadState.Loaded,
        LoadState.Offline,
        LoadState.Error("boom"),
    )

    // ── Cache read ─────────────────────────────────────────────────────────────

    @Test
    fun `painting a fresh cache lands on CachedFresh from a cold start`() {
        assertThat(reduce(LoadState.Idle, LoadEvent.CacheFreshPainted)).isEqualTo(LoadState.CachedFresh)
    }

    @Test
    fun `painting a stale cache lands on CachedStale from a cold start`() {
        assertThat(reduce(LoadState.Idle, LoadEvent.CacheStalePainted)).isEqualTo(LoadState.CachedStale)
    }

    @Test
    fun `a cache miss is Loading, the skeleton state of a cold start`() {
        assertThat(reduce(LoadState.Idle, LoadEvent.CacheMissed)).isEqualTo(LoadState.Loading)
    }

    @Test
    fun `no other event ever produces Loading, so a skeleton never covers painted data`() {
        val events = listOf(
            LoadEvent.CacheFreshPainted,
            LoadEvent.CacheStalePainted,
            LoadEvent.FetchSucceeded,
            LoadEvent.FetchFailed(offline),
            LoadEvent.FetchFailed(serverError),
            LoadEvent.RevalidationFailed(offline),
            LoadEvent.RevalidationFailed(serverError),
            LoadEvent.Reset,
        )
        everyState.filter { it != LoadState.Loading }.forEach { state ->
            events.forEach { event -> assertThat(reduce(state, event)).isNotEqualTo(LoadState.Loading) }
        }
    }

    // ── Foreground fetch (cold start, expired cache, pull-to-refresh) ──────────

    @Test
    fun `a successful fetch lands on Loaded from every state`() {
        everyState.forEach { state ->
            assertThat(reduce(state, LoadEvent.FetchSucceeded)).isEqualTo(LoadState.Loaded)
        }
    }

    @Test
    fun `a network failure on a foreground fetch is Offline and never Error`() {
        everyState.forEach { state ->
            assertThat(reduce(state, LoadEvent.FetchFailed(offline))).isEqualTo(LoadState.Offline)
        }
    }

    @Test
    fun `a non-network failure on a foreground fetch carries its message into Error`() {
        everyState.forEach { state ->
            assertThat(reduce(state, LoadEvent.FetchFailed(serverError)))
                .isEqualTo(LoadState.Error("Internal error"))
        }
    }

    // ── Silent revalidation (stale cache already painted) ──────────────────────

    @Test
    fun `a silent revalidation failing offline over a stale cache surfaces Offline`() {
        assertThat(reduce(LoadState.CachedStale, LoadEvent.RevalidationFailed(offline)))
            .isEqualTo(LoadState.Offline)
    }

    @Test
    fun `a silent revalidation failing offline over a fresh cache surfaces Offline`() {
        assertThat(reduce(LoadState.CachedFresh, LoadEvent.RevalidationFailed(offline)))
            .isEqualTo(LoadState.Offline)
    }

    @Test
    fun `a silent revalidation failing for any other reason leaves the stale cache untouched`() {
        assertThat(reduce(LoadState.CachedStale, LoadEvent.RevalidationFailed(serverError)))
            .isEqualTo(LoadState.CachedStale)
        assertThat(reduce(LoadState.CachedFresh, LoadEvent.RevalidationFailed(serverError)))
            .isEqualTo(LoadState.CachedFresh)
    }

    @Test
    fun `a silent revalidation failure never regresses a screen that already loaded`() {
        assertThat(reduce(LoadState.Loaded, LoadEvent.RevalidationFailed(offline))).isEqualTo(LoadState.Loaded)
        assertThat(reduce(LoadState.Loaded, LoadEvent.RevalidationFailed(serverError))).isEqualTo(LoadState.Loaded)
    }

    @Test
    fun `a silent revalidation failure never introduces an Error`() {
        val statesWithoutError = everyState.filterNot { it is LoadState.Error }

        statesWithoutError.forEach { state ->
            assertThat(reduce(state, LoadEvent.RevalidationFailed(serverError))).isEqualTo(state)
            assertThat(reduce(state, LoadEvent.RevalidationFailed(offline))).isNotInstanceOf(LoadState.Error::class.java)
        }
    }

    // ── Reset ──────────────────────────────────────────────────────────────────

    @Test
    fun `reset returns every state to Idle`() {
        everyState.forEach { state ->
            assertThat(reduce(state, LoadEvent.Reset)).isEqualTo(LoadState.Idle)
        }
    }

    // ── Failure classification ─────────────────────────────────────────────────

    @Test
    fun `the NETWORK error code classifies as Offline`() {
        assertThat(LoadFailure.fromErrorCode(code = "NETWORK", message = "Network unavailable"))
            .isEqualTo(LoadFailure.Offline)
    }

    @Test
    fun `any other error code classifies as a failure carrying its message`() {
        assertThat(LoadFailure.fromErrorCode(code = "INTERNAL_ERROR", message = "Oops"))
            .isEqualTo(LoadFailure.Failed("Oops"))
    }

    @Test
    fun `a missing error code classifies as a failure carrying its message`() {
        assertThat(LoadFailure.fromErrorCode(code = null, message = "No code"))
            .isEqualTo(LoadFailure.Failed("No code"))
    }

    @Test
    fun `the NETWORK code is matched exactly, not by prefix`() {
        assertThat(LoadFailure.fromErrorCode(code = "NETWORK_DOWN", message = "x"))
            .isEqualTo(LoadFailure.Failed("x"))
    }
}
