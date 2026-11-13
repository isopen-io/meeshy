package me.meeshy.sdk.model.call

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Who reads a replayed transcript: their id (to recognise their own words, which read « Vous »)
 * and their prism (`ReaderPrism.resolve`) to elect the served translation.
 */
data class CallTranscriptReader(
    val userId: String?,
    val prism: List<String>,
)

/**
 * One line of the « Transcription » section. [translated] is the text served in the
 * reader's prism, `null` when the original is what the reader should read (their own
 * words, or no translation in their prism). [elapsedLabel] is the clock since the
 * call started, `null` when no start could be read.
 */
data class CallTranscriptLine(
    val speakerName: String,
    val isLocal: Boolean,
    val elapsedLabel: String?,
    val original: String,
    val translated: String?,
    val translatedLanguage: String?,
    /** Who spoke: the post-call journal keeps the speaker's colour (#16634). */
    val speakerId: String = "",
    /** #16665 — a capture line: [speakerName] is who captured (blank for a call-recording bound), no text. */
    val captureKind: CallCaptureKind? = null,
) {
    /** A sentence is served translated only when it is not mine, not a capture, and the translation says something. */
    val servesTranslation: Boolean get() = !isLocal && captureKind == null && !translated.isNullOrBlank()

    /** Whether the row shows the served translation (its text and its ink): served, and the toggle not on the original. */
    fun showsTranslation(showOriginal: Boolean): Boolean = servesTranslation && !showOriginal

    /** What the row shows: the served translation, else the original. */
    fun text(showOriginal: Boolean): String = translated?.takeIf { showsTranslation(showOriginal) } ?: original

    /**
     * #17340, #17862 — the line unfolded below the leading one: « Original · … » by default, « Traduit · … » once the
     * switch shows the original. The switch INVERTS the two lines, nothing disappears. Never for my own sentence, a
     * capture, or a sentence without translation: those read alone in both states.
     */
    fun secondary(showOriginal: Boolean): CallTranscriptSecondary? {
        val served = translated?.takeIf { servesTranslation } ?: return null
        return if (showOriginal) {
            CallTranscriptSecondary(CallTranscriptSecondaryKind.TRANSLATED, served)
        } else {
            CallTranscriptSecondary(CallTranscriptSecondaryKind.ORIGINAL, original)
        }
    }
}

/** Which version the line below a journal sentence carries — it names its own label (« Original » / « Traduit »). */
enum class CallTranscriptSecondaryKind { ORIGINAL, TRANSLATED }

/** The line under a journal sentence: its [text] and the [kind] that says how it reads. */
data class CallTranscriptSecondary(val kind: CallTranscriptSecondaryKind, val text: String)

/**
 * The persisted journal of `GET /calls/{callId}/transcript`, projected for one
 * reader — port of iOS `CallTranscriptLoader.fetchRemote` and the rows of
 * `CallTranscriptSection`. The translation is elected by the Prisme descent
 * ([PrismTranslationResolver]): the first language of the reader served wins, the
 * original language competing at its rank; no match serves the original, never the
 * first translation. The reader's own words are never translated.
 */
object CallTranscriptReplay {
    fun lines(
        page: CallTranscriptPage,
        reader: CallTranscriptReader,
        recordStartedAt: String,
        youLabel: String,
        participantLabel: String,
    ): List<CallTranscriptLine> {
        val startMs = isoToEpochMillisOrNull(page.callStartedAt) ?: isoToEpochMillisOrNull(recordStartedAt)
        val readerId = reader.userId?.takeIf { it.isNotBlank() }
        val speech = page.segments
            .filter { it.text.isNotBlank() }
            .map { segment ->
                val isLocal = readerId != null && segment.speakerId == readerId
                val translation = if (isLocal) null else served(segment, reader.prism)
                CallTranscriptLine(
                    speakerName = if (isLocal) {
                        youLabel
                    } else {
                        segment.speakerDisplayName?.takeIf { it.isNotBlank() } ?: participantLabel
                    },
                    isLocal = isLocal,
                    elapsedLabel = CallJournalClock.label(segment.capturedAtMs, startMs),
                    original = segment.text,
                    translated = translation?.text,
                    translatedLanguage = translation?.language,
                    speakerId = segment.speakerId,
                ).let { segment.capturedAtMs to it }
            }
        val captures = page.captures.mapNotNull { capture(it, startMs, readerId, youLabel, participantLabel) }
        return (speech + captures).sortedBy { it.first }.map { it.second }
    }

    /**
     * #16665 — a capture takes its place among the sentences, at its instant (or the call
     * start plus its offset). The reader's own capture reads « Vous ».
     */
    private fun capture(
        capture: PersistedTranscriptCapture,
        startMs: Long?,
        readerId: String?,
        youLabel: String,
        participantLabel: String,
    ): Pair<Long, CallTranscriptLine>? {
        val kind = CallCaptureKind.fromWire(capture.kind) ?: return null
        val atMs = isoToEpochMillisOrNull(capture.at) ?: startMs?.plus(capture.offsetMs) ?: return null
        val capturerId = capture.userId?.takeIf { it.isNotBlank() } ?: capture.participantId
        val isLocal = readerId != null && capturerId == readerId
        val name = when {
            !kind.namesCapturer -> ""
            isLocal -> youLabel
            else -> capture.displayName?.takeIf { it.isNotBlank() } ?: participantLabel
        }
        return atMs to CallTranscriptLine(
            speakerName = name,
            isLocal = isLocal,
            elapsedLabel = CallJournalClock.label(atMs, startMs),
            original = "",
            translated = null,
            translatedLanguage = null,
            speakerId = capturerId,
            captureKind = kind,
        )
    }

    private fun served(segment: PersistedTranscriptSegment, prism: List<String>) =
        PrismTranslationResolver.resolve(
            originalLanguage = segment.language,
            candidates = segment.translations.map { PrismCandidate(it.targetLanguage, it.translatedText) },
            preferredLanguages = prism,
        )
}

/**
 * What the « Transcription » section shows. As on iOS, nothing is drawn while
 * loading nor when there is nothing to show — most calls have no transcript, so a
 * placeholder would flash and vanish. A refusal (403: the reader did not take part)
 * or an unknown call (404) is « nothing to show »; only a transient failure
 * (offline, server error) is drawn, with a retry.
 */
sealed interface CallTranscriptState {
    val isVisible: Boolean

    /**
     * Nothing is known of the call yet: the encrypted copy on this device is being read (or is about to be). Not a wait
     * on the network — a copy found here is drawn at once, so no waiting is ever shown on it (A1.14, iOS
     * `BubbleCallJournalLoading.load(willWaitOnNetwork:)`).
     */
    data object ReadingCopy : CallTranscriptState {
        override val isVisible: Boolean get() = false
    }

    /** The device holds no copy: the server replay is awaited (the only state that shows a waiting). */
    data object Loading : CallTranscriptState {
        override val isVisible: Boolean get() = false
    }

    data object Absent : CallTranscriptState {
        override val isVisible: Boolean get() = false
    }

    data object Failed : CallTranscriptState {
        override val isVisible: Boolean get() = true
    }

    data class Ready(val lines: List<CallTranscriptLine>) : CallTranscriptState {
        override val isVisible: Boolean get() = true

        /** The original/translation toggle only exists when it changes something. */
        val canShowOriginal: Boolean get() = lines.any { it.servesTranslation }
    }

    companion object {
        fun of(lines: List<CallTranscriptLine>): CallTranscriptState = if (lines.isEmpty()) Absent else Ready(lines)

        fun forFailure(httpStatus: Int?): CallTranscriptState =
            if (httpStatus in HIDDEN_STATUSES) Absent else Failed

        private val HIDDEN_STATUSES = setOf(403, 404)
    }
}
