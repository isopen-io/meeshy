package me.meeshy.sdk.testing

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import java.io.File

/**
 * The deterministic host for every JVM unit test that drives a **real**, file-backed
 * Preferences [DataStore].
 *
 * ## Why this exists
 *
 * These tests used to build the store's scope as `CoroutineScope(SupervisorJob() +
 * Dispatchers.IO)` and bound each assertion with `withTimeout(15_000)`. Both halves of
 * that recipe were wrong in the same way: the stores publish their state as
 * `dataStore.data.map { … }.stateIn(scope, SharingStarted.Eagerly, DEFAULT)`, so an
 * assertion shaped `first { predicate }` can only be satisfied once the sharing
 * coroutine has actually been *scheduled* on a real thread pool. On a CI runner that
 * runs the whole monorepo matrix at once, that scheduling latency is unbounded — which
 * makes the assertion a bet on runner load, and the timeout merely the size of the bet.
 *
 * The bet was re-priced twice (`5_000` → `15_000`) and lost anyway, three times, on
 * three different files — including files that had always used the higher value and had
 * never flaked. See `apps/android/tasks/android-routine/NOTES.md` (2026-08-16) for the
 * three falsifications; the standing conclusion there is that raising the constant again
 * buys nothing but another quiet interval.
 *
 * ## What this does instead
 *
 * [UnconfinedTestDispatcher] removes the scheduling from the picture rather than
 * budgeting for it: every coroutine started on [scope] — the DataStore write actor, the
 * `stateIn` sharing collector — runs eagerly and inline on the test thread. Nothing is
 * ever queued behind a thread pool that may not get CPU, so no wall-clock bound is
 * needed and none is used. `runTest`'s own 60 s safety net (four times the bound it
 * replaces) is what catches a genuine hang.
 *
 * Pair it with `runTest(dispatcher) { … }` so the test body shares that scheduler, and
 * close it from `@After`:
 *
 * ```
 * private val dataStores = TestDataStores()
 *
 * @After fun tearDown() = dataStores.close()
 *
 * @Test fun x() = runTest(dataStores.dispatcher) {
 *     val store = DataStoreThemeStore(dataStores.preferences(tmp.newFile("x.preferences_pb")), dataStores.scope)
 *     …
 * }
 * ```
 */
@OptIn(ExperimentalCoroutinesApi::class)
class TestDataStores {

    /** Runs every coroutine inline on the test thread — no pool, no scheduling latency. */
    val dispatcher: TestDispatcher = UnconfinedTestDispatcher()

    /** The scope handed to both [PreferenceDataStoreFactory] and the stores under test. */
    val scope: CoroutineScope = CoroutineScope(SupervisorJob() + dispatcher)

    /**
     * A real Preferences [DataStore] over [file], driven by [scope].
     *
     * DataStore enforces one active instance per file per process, so a test that needs
     * two store wrappers over the same durable state must call this **once** and share
     * the result.
     */
    fun preferences(file: File): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = scope) { file }

    /** Cancels the write actor and every `stateIn` collector started on [scope]. */
    fun close() {
        scope.cancel()
    }
}
