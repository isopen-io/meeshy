package me.meeshy.app.calls

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.call.CallEndReason
import me.meeshy.sdk.model.call.CallPersistedQualitySummary
import me.meeshy.sdk.model.call.CallStats
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

@OptIn(ExperimentalCoroutinesApi::class)
class CallQualitySummaryStoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    private val dispatcher = UnconfinedTestDispatcher()
    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    @After
    fun tearDown() = scope.cancel()

    private fun dataStore() = PreferenceDataStoreFactory.create(scope = scope) { tmp.newFile("summary.preferences_pb") }

    private fun store() = DataStoreCallQualitySummaryStore(dataStore())

    @Test
    fun `nothing is read before any call has ended`() = runTest(dispatcher) {
        assertThat(store().read()).isNull()
    }

    @Test
    fun `the last summary is read back whole`() = runTest(dispatcher) {
        val store = store()
        val summary = CallPersistedQualitySummary.of(
            CallStats(roundTripTimeMs = 51.5, jitterMs = 4.0, packetsLost = 2, bandwidth = 900L, bytesReceived = 1200L, codec = "opus"),
            "c1", 125, "alice", CallEndReason.Remote,
        )

        store.persist(summary)

        assertThat(store.read()).isEqualTo(summary)
    }

    @Test
    fun `a newer summary replaces the older one, stats included`() = runTest(dispatcher) {
        val store = store()
        store.persist(CallPersistedQualitySummary.of(CallStats(codec = "opus"), "c1", 10, "a", CallEndReason.Local))

        store.persist(CallPersistedQualitySummary.of(null, "c2", 3, null, CallEndReason.Missed))

        val read = store.read()!!
        assertThat(read.callId).isEqualTo("c2")
        assertThat(read.remoteUser).isNull()
        assertThat(read.stats).isNull()
    }

    @Test
    fun `a byte cumul beyond 2 GB is read back whole`() = runTest(dispatcher) {
        val store = store()
        val summary = CallPersistedQualitySummary.of(
            CallStats(bandwidth = 3_000_000_000L, bytesReceived = 5_000_000_000L),
            "c1", 7200, "alice", CallEndReason.Local,
        )

        store.persist(summary)

        assertThat(store.read()).isEqualTo(summary)
    }

    @Test
    fun `a summary written before the Long byte keys is still read back`() = runTest(dispatcher) {
        val prefs = dataStore()
        prefs.edit {
            it[stringPreferencesKey("end_reason")] = "remote"
            it[longPreferencesKey("duration_seconds")] = 60L
            it[intPreferencesKey("has_stats")] = 1
            it[intPreferencesKey("bandwidth")] = 900
            it[intPreferencesKey("bytes_received")] = 1_200
        }

        val stats = DataStoreCallQualitySummaryStore(prefs).read()!!.stats!!

        assertThat(stats.bandwidth).isEqualTo(900L)
        assertThat(stats.bytesReceived).isEqualTo(1_200L)
    }
}
