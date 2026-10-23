package me.meeshy.sdk.call

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import me.meeshy.sdk.model.call.CallStats
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * Lit UN instantané des statistiques du pair courant et le réduit en [CallStats] : `getStats` →
 * [CallStats.RawEntry] → [CallStats.reduce]. Aucune décision ici — la qualité, les seuils et la
 * détection de la route relayée vivent dans `:core:model` ; ce collecteur n'est que la colle
 * `RTCStatsReport` → valeurs pures (miroir de `P2PWebRTCClient.getStats` côté iOS).
 */
@Singleton
public class CallStatsCollector internal constructor(
    private val peer: () -> CallPeerHandle?,
) {
    @Inject
    public constructor(engine: WebRtcEngine) : this({ engine.peerHandle })

    /** `null` hors appel, ou quand le pair ne répond pas dans [REPORT_TIMEOUT_MS]. */
    public suspend fun collect(): CallStats? {
        val handle = peer() ?: return null
        val report = withTimeoutOrNull(REPORT_TIMEOUT_MS) {
            suspendCancellableCoroutine<RTCStatsReport> { cont ->
                handle.getStats(RTCStatsCollectorCallback { cont.resume(it) })
            }
        } ?: return null
        return CallStats.reduce(rawEntries(report))
    }

    internal companion object {
        const val REPORT_TIMEOUT_MS: Long = 4_000L

        /** Projette chaque entrée du rapport : nombres en `Double`, identifiants de route en texte. */
        fun rawEntries(report: RTCStatsReport): List<CallStats.RawEntry> =
            report.statsMap.values.map { stat ->
                val members = stat.members
                CallStats.RawEntry(
                    id = stat.id,
                    type = stat.type,
                    kind = (members["kind"] as? String) ?: (members["mediaType"] as? String),
                    codecId = members["codecId"] as? String,
                    mimeType = members["mimeType"] as? String,
                    values = NUMERIC_KEYS.mapNotNull { key ->
                        (members[key] as? Number)?.let { key to it.toDouble() }
                    }.toMap(),
                    strings = STRING_KEYS.mapNotNull { key ->
                        (members[key] as? String)?.let { key to it }
                    }.toMap(),
                )
            }

        private val NUMERIC_KEYS = listOf(
            "currentRoundTripTime", "availableOutgoingBitrate", "packetsLost", "packetsReceived",
            "packetsSent", "bytesSent", "bytesReceived", "jitter", "audioLevel", "nominated",
        )

        private val STRING_KEYS = listOf(
            "selectedCandidatePairId", "localCandidateId", "remoteCandidateId", "candidateType", "state",
        )
    }
}
