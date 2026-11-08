package me.meeshy.app.calls

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
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

    private fun store() = DataStoreCallQualitySummaryStore(
        PreferenceDataStoreFactory.create(scope = scope) { tmp.newFile("summary.preferences_pb") },
    )

    @Test
    fun `nothing is read before any call has ended`() = runTest(dispatcher) {
        assertThat(store().read()).isNull()
    }

    @Test
    fun `the last summary is read back whole`() = runTest(dispatcher) {
        val store = store()
        val summary = CallPersistedQualitySummary.of(
            CallStats(roundTripTimeMs = 51.5, jitterMs = 4.0, packetsLost = 2, bandwidth = 900, bytesReceived = 1200, codec = "opus"),
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
}
