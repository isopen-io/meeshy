package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallQualitySample
import me.meeshy.sdk.model.call.CallState
import me.meeshy.sdk.model.call.DegradedLinkTracker
import me.meeshy.sdk.socket.CallSignalManager

/**
 * Ce que chaque tick de qualité déclenche hors de l'indicateur : le rapport `call:quality-report`
 * vers la passerelle (palier sur 4 niveaux, débits cumulés) et la garde « lien dégradé » (deux ticks
 * dégradés consécutifs, reprise immédiate, `fair` n'alerte jamais). Comme sur iOS, rien ne part ni
 * ne compte hors de l'état connecté : pendant un redémarrage ICE les compteurs sont gelés et un
 * zéro se lirait « excellent ».
 */
class CallQualityController(private val signals: CallSignalManager) {
    private var tracker = DegradedLinkTracker()

    /** Vrai tant que le lien est jugé dégradé de façon soutenue. */
    val isLinkDegraded: Boolean get() = tracker.isDegraded

    fun begin() {
        tracker = DegradedLinkTracker()
    }

    fun onSample(host: CallSessionHost, sample: CallQualitySample) {
        if (host.callState !is CallState.Connected) return
        tracker = tracker.record(sample.level())
        if (host.callId.isBlank()) return
        signals.emitQualityReport(host.callId, sample.toReport())
    }
}
