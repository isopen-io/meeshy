package me.meeshy.app.calls

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.doublePreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStoreFile
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import me.meeshy.sdk.model.call.CallPersistedQualitySummary
import me.meeshy.sdk.model.call.CallStats

import javax.inject.Qualifier
import javax.inject.Singleton

/** Le dernier résumé de qualité d'appel, relisible après un redémarrage (iOS `CallQualitySummaryStoring`). */
interface CallQualitySummaryStoring {
    suspend fun read(): CallPersistedQualitySummary?
    suspend fun persist(summary: CallPersistedQualitySummary)
}

/** Volatile : témoins et aperçus. */
class InMemoryCallQualitySummaryStore : CallQualitySummaryStoring {
    private var last: CallPersistedQualitySummary? = null
    override suspend fun read(): CallPersistedQualitySummary? = last
    override suspend fun persist(summary: CallPersistedQualitySummary) {
        last = summary
    }
}

/** Durable : un seul résumé, écrasé à chaque fin d'appel. Les statistiques absentes restent absentes. */
class DataStoreCallQualitySummaryStore(
    private val dataStore: DataStore<Preferences>,
) : CallQualitySummaryStoring {

    override suspend fun read(): CallPersistedQualitySummary? {
        val prefs = dataStore.data.first()
        val reason = prefs[END_REASON] ?: return null
        return CallPersistedQualitySummary(
            callId = prefs[CALL_ID],
            remoteUser = prefs[REMOTE_USER],
            durationSeconds = prefs[DURATION] ?: 0,
            endReason = reason,
            stats = if (prefs[HAS_STATS] == 1) readStats(prefs) else null,
        )
    }

    override suspend fun persist(summary: CallPersistedQualitySummary) {
        dataStore.edit { prefs ->
            prefs.clear()
            prefs[END_REASON] = summary.endReason
            prefs[DURATION] = summary.durationSeconds
            summary.callId?.let { prefs[CALL_ID] = it }
            summary.remoteUser?.let { prefs[REMOTE_USER] = it }
            summary.stats?.let { writeStats(prefs, it) }
        }
    }

    private fun writeStats(prefs: androidx.datastore.preferences.core.MutablePreferences, s: CallStats) {
        prefs[HAS_STATS] = 1
        prefs[RTT] = s.roundTripTimeMs
        prefs[JITTER] = s.jitterMs
        prefs[PACKETS_LOST] = s.packetsLost
        prefs[BANDWIDTH] = s.bandwidth
        prefs[BYTES_RECEIVED] = s.bytesReceived
        prefs[INBOUND_PACKETS] = s.inboundPacketsReceived
        prefs[OUTBOUND_PACKETS] = s.outboundPacketsSent
        prefs[AVAILABLE_BITRATE] = s.availableOutgoingBitrateBps
        s.codec?.let { prefs[CODEC] = it }
    }

    private fun readStats(prefs: Preferences) = CallStats(
        roundTripTimeMs = prefs[RTT] ?: 0.0,
        jitterMs = prefs[JITTER] ?: 0.0,
        packetsLost = prefs[PACKETS_LOST] ?: 0,
        bandwidth = prefs[BANDWIDTH] ?: 0,
        bytesReceived = prefs[BYTES_RECEIVED] ?: 0,
        inboundPacketsReceived = prefs[INBOUND_PACKETS] ?: 0,
        outboundPacketsSent = prefs[OUTBOUND_PACKETS] ?: 0,
        availableOutgoingBitrateBps = prefs[AVAILABLE_BITRATE] ?: 0,
        codec = prefs[CODEC],
    )

    private companion object {
        val CALL_ID = stringPreferencesKey("call_id")
        val REMOTE_USER = stringPreferencesKey("remote_user")
        val END_REASON = stringPreferencesKey("end_reason")
        val DURATION = longPreferencesKey("duration_seconds")
        val HAS_STATS = intPreferencesKey("has_stats")
        val RTT = doublePreferencesKey("rtt_ms")
        val JITTER = doublePreferencesKey("jitter_ms")
        val PACKETS_LOST = intPreferencesKey("packets_lost")
        val BANDWIDTH = intPreferencesKey("bandwidth")
        val BYTES_RECEIVED = intPreferencesKey("bytes_received")
        val INBOUND_PACKETS = intPreferencesKey("inbound_packets")
        val OUTBOUND_PACKETS = intPreferencesKey("outbound_packets")
        val AVAILABLE_BITRATE = intPreferencesKey("available_bitrate_bps")
        val CODEC = stringPreferencesKey("codec")
    }
}

@Qualifier
@Retention(AnnotationRetention.BINARY)
internal annotation class CallQualitySummaryPrefs

@Module
@InstallIn(SingletonComponent::class)
internal object CallQualitySummaryModule {
    @Provides
    @Singleton
    @CallQualitySummaryPrefs
    fun providesPrefs(@ApplicationContext context: Context): DataStore<Preferences> =
        PreferenceDataStoreFactory.create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)) {
            context.preferencesDataStoreFile("meeshy_call_quality_summary")
        }

    @Provides
    @Singleton
    fun providesStore(@CallQualitySummaryPrefs dataStore: DataStore<Preferences>): CallQualitySummaryStoring =
        DataStoreCallQualitySummaryStore(dataStore)
}
