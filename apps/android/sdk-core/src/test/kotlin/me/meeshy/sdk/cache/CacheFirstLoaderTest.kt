package me.meeshy.sdk.cache

import app.cash.turbine.test
import com.google.common.truth.Truth.assertThat
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.cache.LoadState
import me.meeshy.sdk.net.ApiError
import me.meeshy.sdk.net.NetworkResult
import org.junit.Test

class CacheFirstLoaderTest {

    // ── Fixtures ───────────────────────────────────────────────────────────────

    private class FakeStore(
        var cached: CacheResult<List<String>> = CacheResult.Empty,
        var recoverable: CachedSnapshot<String>? = null,
    ) : MutableCacheStore<String, String> {
        override val policy: CachePolicy = CachePolicy.Default
        val saved = mutableListOf<List<String>>()
        var loadCalls = 0
        var loadFailure: Exception? = null
        var saveFailure: Exception? = null

        override suspend fun load(key: String): CacheResult<List<String>> {
            loadCalls++
            loadFailure?.let { throw it }
            return cached
        }

        override suspend fun loadIgnoringExpiry(key: String): CachedSnapshot<String>? = recoverable

        override suspend fun save(items: List<String>, key: String) {
            saveFailure?.let { throw it }
            saved += items
        }
    }

    private fun loaderOver(
        store: FakeStore,
        onCacheError: (Throwable) -> Unit = {},
    ) = CacheFirstLoader(store = store, key = "conv-1", onCacheError = onCacheError)

    private fun items(vararg values: String): suspend () -> NetworkResult<List<String>> =
        { NetworkResult.Success(values.toList()) }

    private val networkDown: suspend () -> NetworkResult<List<String>> =
        { NetworkResult.Failure(ApiError(message = "Network unavailable", code = "NETWORK")) }

    private val serverRefuses: suspend () -> NetworkResult<List<String>> =
        { NetworkResult.Failure(ApiError(message = "Internal error", code = "INTERNAL_ERROR", httpStatus = 500)) }

    private fun fresh(vararg values: String) = CacheResult.Fresh(values.toList(), ageMillis = 1_000L)
    private fun stale(vararg values: String) = CacheResult.Stale(values.toList(), ageMillis = 600_000L)
    private fun expired(vararg values: String) = CacheResult.Syncing(values.toList())

    private fun painted(vararg values: String, state: LoadState) = CacheFirstEvent.Items(values.toList(), state)
    private fun state(state: LoadState) = CacheFirstEvent.State(state)

    // ── Cold start: empty cache ────────────────────────────────────────────────

    @Test
    fun `an empty cache shows Loading, then the fetched items as Loaded, and persists them`() = runTest {
        val store = FakeStore(cached = CacheResult.Empty)

        loaderOver(store).load(items("a", "b")).test {
            assertThat(awaitItem()).isEqualTo(state(LoadState.Loading))
            assertThat(awaitItem()).isEqualTo(painted("a", "b", state = LoadState.Loaded))
            awaitComplete()
        }
        assertThat(store.saved).containsExactly(listOf("a", "b"))
    }

    @Test
    fun `an empty cache with no network ends Offline and never Error`() = runTest {
        loaderOver(FakeStore()).load(networkDown).test {
            assertThat(awaitItem()).isEqualTo(state(LoadState.Loading))
            assertThat(awaitItem()).isEqualTo(state(LoadState.Offline))
            awaitComplete()
        }
    }

    @Test
    fun `an empty cache whose fetch throws an IOException ends Offline`() = runTest {
        val store = FakeStore()

        loaderOver(store).load { throw IOException("Unable to resolve host") }.test {
            assertThat(awaitItem()).isEqualTo(state(LoadState.Loading))
            assertThat(awaitItem()).isEqualTo(state(LoadState.Offline))
            awaitComplete()
        }
        assertThat(store.saved).isEmpty()
    }

    @Test
    fun `an empty cache refused by the gateway ends in Error carrying the message`() = runTest {
        loaderOver(FakeStore()).load(serverRefuses).test {
            assertThat(awaitItem()).isEqualTo(state(LoadState.Loading))
            assertThat(awaitItem()).isEqualTo(state(LoadState.Error("Internal error")))
            awaitComplete()
        }
    }

    // ── Fresh cache ────────────────────────────────────────────────────────────

    @Test
    fun `a fresh cache is painted as CachedFresh and the network is never asked`() = runTest {
        val store = FakeStore(cached = fresh("x", "y"))
        var fetches = 0

        loaderOver(store).load({ fetches++; items("never")() }).test {
            assertThat(awaitItem()).isEqualTo(painted("x", "y", state = LoadState.CachedFresh))
            awaitComplete()
        }
        assertThat(fetches).isEqualTo(0)
        assertThat(store.saved).isEmpty()
    }

    // ── Stale cache: paint at once, revalidate silently ────────────────────────

    @Test
    fun `a stale cache is painted at once then replaced by the revalidated items`() = runTest {
        val store = FakeStore(cached = stale("old"))

        loaderOver(store).load(items("new")).test {
            assertThat(awaitItem()).isEqualTo(painted("old", state = LoadState.CachedStale))
            assertThat(awaitItem()).isEqualTo(painted("new", state = LoadState.Loaded))
            awaitComplete()
        }
        assertThat(store.saved).containsExactly(listOf("new"))
    }

    @Test
    fun `a stale cache never shows Loading`() = runTest {
        val events = loaderOver(FakeStore(cached = stale("old"))).load(items("new")).toList()

        assertThat(events).doesNotContain(state(LoadState.Loading))
    }

    @Test
    fun `a silent revalidation refused by the gateway leaves the stale items on screen untouched`() = runTest {
        val store = FakeStore(cached = stale("old"))

        loaderOver(store).load(serverRefuses).test {
            assertThat(awaitItem()).isEqualTo(painted("old", state = LoadState.CachedStale))
            awaitComplete()
        }
        assertThat(store.saved).isEmpty()
    }

    @Test
    fun `a silent revalidation failing offline adds the Offline hint and keeps the items`() = runTest {
        loaderOver(FakeStore(cached = stale("old"))).load(networkDown).test {
            assertThat(awaitItem()).isEqualTo(painted("old", state = LoadState.CachedStale))
            assertThat(awaitItem()).isEqualTo(state(LoadState.Offline))
            awaitComplete()
        }
    }

    // ── Expired cache: the last known data is repainted ────────────────────────

    @Test
    fun `an expired cache repaints its last known items instead of an empty screen`() = runTest {
        val store = FakeStore(cached = expired("last-known"))

        loaderOver(store).load(items("new")).test {
            assertThat(awaitItem()).isEqualTo(painted("last-known", state = LoadState.CachedStale))
            assertThat(awaitItem()).isEqualTo(painted("new", state = LoadState.Loaded))
            awaitComplete()
        }
    }

    @Test
    fun `an expired cache offline keeps its last known items and only adds the Offline hint`() = runTest {
        val events = loaderOver(FakeStore(cached = expired("last-known"))).load(networkDown).toList()

        assertThat(events).containsExactly(
            painted("last-known", state = LoadState.CachedStale),
            state(LoadState.Offline),
        ).inOrder()
    }

    @Test
    fun `an expired cache refused by the gateway keeps its items and reports Error`() = runTest {
        val events = loaderOver(FakeStore(cached = expired("last-known"))).load(serverRefuses).toList()

        assertThat(events).containsExactly(
            painted("last-known", state = LoadState.CachedStale),
            state(LoadState.Error("Internal error")),
        ).inOrder()
    }

    @Test
    fun `a store that dropped the expired entry still repaints it through loadIgnoringExpiry`() = runTest {
        val store = FakeStore(
            cached = CacheResult.Empty,
            recoverable = CachedSnapshot(items = listOf("on-disk"), ageMillis = 99_999_999L),
        )

        loaderOver(store).load(networkDown).test {
            assertThat(awaitItem()).isEqualTo(painted("on-disk", state = LoadState.CachedStale))
            assertThat(awaitItem()).isEqualTo(state(LoadState.Offline))
            awaitComplete()
        }
    }

    @Test
    fun `an expired entry carrying nothing falls back to the recoverable snapshot`() = runTest {
        val store = FakeStore(
            cached = CacheResult.Syncing(null),
            recoverable = CachedSnapshot(items = listOf("on-disk"), ageMillis = 5L),
        )

        loaderOver(store).load(items("new")).test {
            assertThat(awaitItem()).isEqualTo(painted("on-disk", state = LoadState.CachedStale))
            assertThat(awaitItem()).isEqualTo(painted("new", state = LoadState.Loaded))
            awaitComplete()
        }
    }

    @Test
    fun `an empty recoverable snapshot is not worth painting, the skeleton shows instead`() = runTest {
        val store = FakeStore(recoverable = CachedSnapshot(items = emptyList(), ageMillis = 5L))

        val events = loaderOver(store).load(items("new")).toList()

        assertThat(events.first()).isEqualTo(state(LoadState.Loading))
    }

    // ── Persistence and cache faults never regress the screen ──────────────────

    @Test
    fun `a persistence failure keeps the screen Loaded and is reported`() = runTest {
        val store = FakeStore(cached = CacheResult.Empty).apply { saveFailure = IllegalStateException("disk full") }
        val reported = mutableListOf<Throwable>()

        val events = loaderOver(store, onCacheError = { reported += it }).load(items("a")).toList()

        assertThat(events).containsExactly(
            state(LoadState.Loading),
            painted("a", state = LoadState.Loaded),
        ).inOrder()
        assertThat(reported.map { it.message }).containsExactly("disk full")
    }

    @Test
    fun `a persistence failure after a silent revalidation keeps the screen Loaded`() = runTest {
        val store = FakeStore(cached = stale("old")).apply { saveFailure = IllegalStateException("disk full") }

        val events = loaderOver(store).load(items("new")).toList()

        assertThat(events.last()).isEqualTo(painted("new", state = LoadState.Loaded))
    }

    @Test
    fun `a cache read failure is a cache miss, reported, and the network still answers`() = runTest {
        val store = FakeStore().apply { loadFailure = IllegalStateException("db locked") }
        val reported = mutableListOf<Throwable>()

        val events = loaderOver(store, onCacheError = { reported += it }).load(items("a")).toList()

        assertThat(events).containsExactly(
            state(LoadState.Loading),
            painted("a", state = LoadState.Loaded),
        ).inOrder()
        assertThat(reported.map { it.message }).containsExactly("db locked")
    }

    // ── refresh: the explicit pull-to-refresh path ─────────────────────────────

    @Test
    fun `refresh skips the cache and forces the network even over a fresh cache`() = runTest {
        val store = FakeStore(cached = fresh("cached"))

        loaderOver(store).refresh(items("network")).test {
            assertThat(awaitItem()).isEqualTo(painted("network", state = LoadState.Loaded))
            awaitComplete()
        }
        assertThat(store.loadCalls).isEqualTo(0)
        assertThat(store.saved).containsExactly(listOf("network"))
    }

    @Test
    fun `load over a fresh cache stays off the network while refresh does not`() = runTest {
        val store = FakeStore(cached = fresh("cached"))
        var fetches = 0
        val counting: suspend () -> NetworkResult<List<String>> = { fetches++; NetworkResult.Success(listOf("n")) }

        loaderOver(store).load(counting).toList()
        assertThat(fetches).isEqualTo(0)

        loaderOver(store).refresh(counting).toList()
        assertThat(fetches).isEqualTo(1)
    }

    @Test
    fun `refresh offline reports Offline and erases nothing`() = runTest {
        val events = loaderOver(FakeStore(cached = fresh("cached"))).refresh(networkDown).toList()

        assertThat(events).containsExactly(state(LoadState.Offline))
    }

    @Test
    fun `refresh refused by the gateway reports Error and erases nothing`() = runTest {
        val events = loaderOver(FakeStore()).refresh(serverRefuses).toList()

        assertThat(events).containsExactly(state(LoadState.Error("Internal error")))
    }

    @Test
    fun `refresh persists the result even when the screen leaves right after the paint`() = runTest {
        val store = FakeStore()

        val first = loaderOver(store).refresh(items("kept")).first()

        assertThat(first).isEqualTo(painted("kept", state = LoadState.Loaded))
        assertThat(store.saved).containsExactly(listOf("kept"))
    }

    // ── Cancellation: the screen disappears ────────────────────────────────────

    @Test
    fun `leaving the screen cancels the silent revalidation and persists nothing`() = runTest {
        val store = FakeStore(cached = stale("old"))
        val fetchStarted = CompletableDeferred<Unit>()
        val fetchCancelled = CompletableDeferred<Unit>()
        val hanging: suspend () -> NetworkResult<List<String>> = {
            fetchStarted.complete(Unit)
            try {
                awaitCancellation()
            } finally {
                fetchCancelled.complete(Unit)
            }
        }

        loaderOver(store).load(hanging).test {
            assertThat(awaitItem()).isEqualTo(painted("old", state = LoadState.CachedStale))
            fetchStarted.await()
            cancelAndIgnoreRemainingEvents()
        }

        fetchCancelled.await()
        assertThat(store.saved).isEmpty()
    }

    @Test
    fun `leaving the screen cancels a pull-to-refresh in flight without reporting an error`() = runTest {
        val fetchStarted = CompletableDeferred<Unit>()
        val fetchCancelled = CompletableDeferred<Unit>()
        val hanging: suspend () -> NetworkResult<List<String>> = {
            fetchStarted.complete(Unit)
            try {
                awaitCancellation()
            } finally {
                fetchCancelled.complete(Unit)
            }
        }

        loaderOver(FakeStore()).refresh(hanging).test {
            fetchStarted.await()
            cancel()
        }

        fetchCancelled.await()
    }

    // ── Folding the events into a screen state ─────────────────────────────────

    @Test
    fun `folding keeps the painted items when only the state changes`() = runTest {
        val states = loaderOver(FakeStore(cached = stale("old"))).load(networkDown).toStates().toList()

        assertThat(states).containsExactly(
            CacheFirstState(emptyList<String>(), LoadState.Idle),
            CacheFirstState(listOf("old"), LoadState.CachedStale),
            CacheFirstState(listOf("old"), LoadState.Offline),
        ).inOrder()
    }

    @Test
    fun `folding replaces the items when new ones are painted`() = runTest {
        val states = loaderOver(FakeStore(cached = stale("old"))).load(items("new")).toStates().toList()

        assertThat(states.last()).isEqualTo(CacheFirstState(listOf("new"), LoadState.Loaded))
    }
}
