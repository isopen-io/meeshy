package me.meeshy.sdk.call

import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import org.webrtc.RTCStatsCollectorCallback
import org.webrtc.RTCStatsReport
import kotlin.coroutines.resume

/**
 * Le niveau sonore REÇU d'une connexion — iOS `WebRTCGroupPeerLink.audioLevel` / `inboundAudioLevel` : le plus
 * fort des `audioLevel` (0…1) des entrées `inbound-rtp` audio d'un rapport `getStats`. Lu à cadence bornée par
 * l'appelant (le détecteur de parole, toutes les 400 ms), jamais par trame audio ; un parcours sans liste
 * intermédiaire. Aucune décision ici : qui parle relève de `ActiveSpeakerDetector` (`:core:model`).
 */
public object CallInboundAudioLevel {
    internal const val REPORT_TIMEOUT_MS: Long = 1_000L

    /** `null` quand le rapport ne porte aucune entrée audio reçue mesurée. */
    public fun loudest(report: RTCStatsReport): Double? {
        var loudest: Double? = null
        for (stat in report.statsMap.values) {
            if (stat.type != INBOUND_RTP) continue
            val members = stat.members
            val kind = (members["kind"] as? String) ?: (members["mediaType"] as? String)
            if (kind != AUDIO) continue
            val level = (members["audioLevel"] as? Number)?.toDouble() ?: continue
            if (loudest == null || level > loudest) loudest = level
        }
        return loudest
    }

    /** Un relevé : `null` si la connexion ne répond pas dans [REPORT_TIMEOUT_MS] ou ne porte aucun audio reçu. */
    internal suspend fun read(getStats: (RTCStatsCollectorCallback) -> Unit): Double? =
        withTimeoutOrNull(REPORT_TIMEOUT_MS) {
            suspendCancellableCoroutine<RTCStatsReport?> { cont ->
                runCatching { getStats { report -> cont.resume(report) } }
                    .onFailure { cont.resume(null) }
            }
        }?.let(::loudest)

    private const val INBOUND_RTP = "inbound-rtp"
    private const val AUDIO = "audio"
}

/** Le niveau sonore reçu du pair de l'appel (le pair principal d'un groupe). */
public suspend fun CallPeerHandle.inboundAudioLevel(): Double? = CallInboundAudioLevel.read(::getStats)
