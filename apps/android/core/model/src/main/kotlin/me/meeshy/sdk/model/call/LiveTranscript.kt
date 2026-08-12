package me.meeshy.sdk.model.call

/**
 * One live in-call transcript utterance as it accumulates in the rolling
 * [LiveTranscript] — a [CallCaptionSegment] enriched with the finality and
 * wall-clock ordering metadata the accumulator needs. Port of the
 * framework-agnostic subset of the iOS `TranscriptionSegment` the overlay folds
 * via `CallTranscriptionService.appendSegment`.
 *
 *  - [isFinal] distinguishes a finalized utterance from the recognizer's evolving
 *    interim guess: a fresh segment replaces the same speaker's interim line but
 *    never a finalized one.
 *  - [capturedAtMs] is the wall-clock capture time used for display ordering; the
 *    ASR start-time is buffer-relative and resets on recognizer rotation, so only
 *    capture time gives a stable cross-speaker order.
 */
data class CallTranscriptSegment(
    val id: String,
    val speakerId: String,
    val speakerName: String,
    val isLocal: Boolean,
    val text: String,
    val isFinal: Boolean,
    val capturedAtMs: Long,
    val translatedText: String? = null,
    val translatedLanguage: String? = null,
) {
    /** Projects onto the Prisme-faithful [CallCaptionSegment] the resolver renders. */
    fun toCaptionSegment(): CallCaptionSegment = CallCaptionSegment(
        speakerId = speakerId,
        speakerName = speakerName,
        isLocal = isLocal,
        text = text,
        translatedText = translatedText,
        translatedLanguage = translatedLanguage,
    )
}

/**
 * The pure, immutable SSOT rolling live-call transcript the captions overlay
 * renders. Folds incoming [CallTranscriptSegment]s exactly like iOS
 * `CallTranscriptionService.appendSegment`:
 *
 *  - a new segment first drops that speaker's *in-progress* (non-final) line, so
 *    at most one interim line per speaker is ever live (the partial ASR result is
 *    replaced as the recognizer refines it) while every speaker's finalized lines
 *    are preserved;
 *  - the buffer is bounded to [retentionLimit] most-recently-*appended* segments
 *    (insertion-order suffix, matching iOS) so a marathon call stays O(1);
 *  - [ordered] projects the retained set sorted by wall-clock [CallTranscriptSegment
 *    .capturedAtMs] — a stable sort, so equal timestamps keep insertion order.
 */
data class LiveTranscript(
    val segments: List<CallTranscriptSegment> = emptyList(),
) {
    /** The retained segments in on-screen (capture-time) order. */
    val ordered: List<CallTranscriptSegment>
        get() = segments.sortedBy { it.capturedAtMs }

    /** Folds [segment] in, mirroring the iOS append rule, and returns a new transcript. */
    fun append(
        segment: CallTranscriptSegment,
        retentionLimit: Int = DEFAULT_RETENTION_LIMIT,
    ): LiveTranscript {
        val withoutSpeakerInterim =
            segments.filterNot { it.speakerId == segment.speakerId && !it.isFinal }
        val appended = withoutSpeakerInterim + segment
        val cap = retentionLimit.coerceAtLeast(0)
        val capped = if (appended.size > cap) appended.takeLast(cap) else appended
        return LiveTranscript(capped)
    }

    /** The on-screen caption lines under [mode], via the [CallCaptionResolver] SSOT. */
    fun captionLines(mode: CaptionsMode): List<CaptionLine> =
        CallCaptionResolver.resolveAll(ordered.map { it.toCaptionSegment() }, mode)

    companion object {
        /** iOS `CallTranscriptionService.Constants.segmentRetentionLimit`. */
        const val DEFAULT_RETENTION_LIMIT = 50
    }
}
