package me.meeshy.app.calls

import me.meeshy.sdk.model.call.CallCaptureKind
import me.meeshy.sdk.model.call.CallLiveCaptionLine
import me.meeshy.sdk.model.call.CallRecordingSocketEvent

/**
 * #16665 — a capture of the call in progress, as the live journal and the captions band show it
 * (`docs/product/appels-vue-finale.md` loi 13): a peer's screenshot or screen recording, or a
 * bound of the consented call recording. [elapsedLabel] is the call clock when it arrived;
 * [atMs] its arrival, never before what the band already shows.
 */
data class CallLiveCapture(
    val id: String,
    val kind: CallCaptureKind,
    /** Who captured — blank for a call-recording bound nobody asked for. */
    val userId: String,
    val atMs: Long,
    val elapsedLabel: String,
)

/** The live journal's law: one line per person, per kind and per 5 s window, bounded. */
object CallLiveCaptureJournal {
    const val DEDUPE_MS = 5_000L
    private const val MAX = 200

    fun adding(journal: List<CallLiveCapture>, capture: CallLiveCapture): List<CallLiveCapture> {
        val repeats = journal.any {
            it.id == capture.id ||
                (capture.kind.namesCapturer && it.kind == capture.kind && it.userId == capture.userId && kotlin.math.abs(capture.atMs - it.atMs) < DEDUPE_MS)
        }
        return if (repeats) journal else (journal + capture).takeLast(MAX)
    }

    /** The journal line of a consented-recording moment; a stop before any start leaves none. */
    fun recordingMoment(event: CallRecordingSocketEvent): Pair<String, CallCaptureKind>? = when (event) {
        is CallRecordingSocketEvent.Requested -> null
        is CallRecordingSocketEvent.Started -> "rec-start:${event.event.recordingId}" to CallCaptureKind.CALL_RECORDING_STARTED
        is CallRecordingSocketEvent.Stopped ->
            if (event.event.wasRecording) "rec-stop:${event.event.recordingId}" to CallCaptureKind.CALL_RECORDING_STOPPED else null
    }

    fun recordingAuthor(event: CallRecordingSocketEvent): String = when (event) {
        is CallRecordingSocketEvent.Requested -> event.event.requesterId
        is CallRecordingSocketEvent.Started -> event.event.recorderId
        is CallRecordingSocketEvent.Stopped -> event.event.byUserId.orEmpty()
    }
}

/** One row of the captions band: a sentence, or a dated capture. */
sealed interface CallBandEntry {
    val atMs: Long

    data class Sentence(val line: CallLiveCaptionLine) : CallBandEntry {
        override val atMs: Long get() = line.capturedAtMs
    }

    data class Capture(val capture: CallLiveCapture) : CallBandEntry {
        override val atMs: Long get() = capture.atMs
    }
}

/**
 * The band shows the [count] last entries of the live journal, sentences and captures mixed at their
 * time — web `overlayEntries`, iOS `journal.items.suffix(2)`. On a tie, the sentence comes first.
 */
object CallBandEntries {
    fun last(lines: List<CallLiveCaptionLine>, captures: List<CallLiveCapture>, count: Int): List<CallBandEntry> =
        (lines.map { CallBandEntry.Sentence(it) } + captures.map { CallBandEntry.Capture(it) })
            .sortedWith(compareBy<CallBandEntry> { it.atMs }.thenBy { if (it is CallBandEntry.Sentence) 0 else 1 })
            .takeLast(count)
}
