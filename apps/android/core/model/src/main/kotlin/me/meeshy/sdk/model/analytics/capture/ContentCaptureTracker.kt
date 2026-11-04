package me.meeshy.sdk.model.analytics.capture

import me.meeshy.sdk.model.ContentCaptureCandidate
import me.meeshy.sdk.model.ContentCaptureKind
import me.meeshy.sdk.model.ContentCaptureReport

/**
 * **Ce qui a été déclaré pendant un enregistrement** — miroir de `ContentCaptureTracker` (iOS, `ContentCapture.swift`).
 * Valeur sans horloge ni réseau : l'application la nourrit, avec l'heure en millisecondes, depuis UN seul fil.
 *
 * - Une capture d'écran a son identifiant à elle et déclare tout ce qui est visible.
 * - Un enregistrement (ou une recopie) garde UN identifiant du début à la fin : chaque éphémère qui paraît pendant qu'il
 *   tourne est déclaré UNE fois, sous cet identifiant. Les déclarations se regroupent par conversation, au plus une toutes
 *   les [RECORDING_FLUSH_INTERVAL_MS], pour tenir sous le budget de la passerelle (6 déclarations par minute et par
 *   conversation).
 */
class ContentCaptureTracker {

    var recordingCaptureId: String? = null
        private set

    private val declared = mutableSetOf<String>()
    private val pending = mutableListOf<ContentCaptureCandidate>()
    private val lastFlush = mutableMapOf<String, Long>()

    val isRecording: Boolean get() = recordingCaptureId != null

    /** Une capture d'écran : tout ce qui est visible, sous un identifiant neuf. */
    fun screenshot(visible: List<ContentCaptureCandidate>, captureId: String): List<ContentCaptureReport> =
        ContentCaptureReport.reports(visible, ContentCaptureKind.SCREENSHOT, captureId)

    /** L'enregistrement commence : l'identifiant se fixe, ce qui est visible part tout de suite. */
    fun recordingStarted(visible: List<ContentCaptureCandidate>, captureId: String, nowMillis: Long): List<ContentCaptureReport> {
        if (recordingCaptureId != null) return note(visible, nowMillis)
        recordingCaptureId = captureId
        forget()
        return note(visible, nowMillis, force = true)
    }

    /**
     * Ce qui est visible pendant l'enregistrement : seuls les messages jamais déclarés sous cet identifiant s'ajoutent ;
     * une conversation ne part pas plus d'une fois par [RECORDING_FLUSH_INTERVAL_MS] (sauf [force]).
     */
    fun note(visible: List<ContentCaptureCandidate>, nowMillis: Long, force: Boolean = false): List<ContentCaptureReport> {
        val captureId = recordingCaptureId ?: return emptyList()
        visible.filter { it.isDeclared }.forEach { candidate ->
            val key = key(candidate)
            if (key !in declared && pending.none { key(it) == key }) pending += candidate
        }
        val due = pending.map { it.conversationId }.toSet().filter { conversationId ->
            force || lastFlush[conversationId]?.let { nowMillis - it >= RECORDING_FLUSH_INTERVAL_MS } ?: true
        }.toSet()
        if (due.isEmpty()) return emptyList()
        val leaving = pending.filter { it.conversationId in due }
        pending.removeAll { it.conversationId in due }
        leaving.forEach { declared += key(it) }
        due.forEach { lastFlush[it] = nowMillis }
        return ContentCaptureReport.reports(leaving, ContentCaptureKind.RECORDING, captureId)
    }

    /** L'enregistrement s'arrête : ce qui attendait part, et la session s'oublie. */
    fun recordingEnded(visible: List<ContentCaptureCandidate>, nowMillis: Long): List<ContentCaptureReport> {
        val last = note(visible, nowMillis, force = true)
        recordingCaptureId = null
        forget()
        return last
    }

    /**
     * Une déclaration d'enregistrement n'est pas partie : ses messages redeviennent à déclarer, sous le MÊME identifiant
     * (la passerelle dédoublonne).
     */
    fun reportFailed(report: ContentCaptureReport) {
        if (report.kind != ContentCaptureKind.RECORDING || report.captureId != recordingCaptureId) return
        report.messageIds.forEach { declared -= report.conversationId + "|" + it }
    }

    private fun forget() {
        declared.clear()
        pending.clear()
        lastFlush.clear()
    }

    private fun key(candidate: ContentCaptureCandidate): String = candidate.conversationId + "|" + candidate.messageId

    companion object {
        const val RECORDING_FLUSH_INTERVAL_MS: Long = 10_000
    }
}
