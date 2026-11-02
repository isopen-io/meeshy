package me.meeshy.sdk.model.call

import me.meeshy.sdk.lang.PrismCandidate
import me.meeshy.sdk.lang.PrismTranslationResolver
import me.meeshy.sdk.model.isoToEpochMillisOrNull

/**
 * Who reads a replayed transcript: their id (to recognise their own words), their
 * name, and their prism (`ReaderPrism.resolve`) to elect the served translation.
 */
data class CallTranscriptReader(
    val userId: String?,
    val name: String?,
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
) {
    /** What the row shows: the original when asked for, or when nothing was translated. */
    fun text(showOriginal: Boolean): String = if (showOriginal) original else translated ?: original
}

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
        return page.segments
            .filter { it.text.isNotBlank() }
            .sortedBy { it.capturedAtMs }
            .map { segment ->
                val isLocal = readerId != null && segment.speakerId == readerId
                val translation = if (isLocal) null else served(segment, reader.prism)
                CallTranscriptLine(
                    speakerName = if (isLocal) {
                        reader.name?.takeIf { it.isNotBlank() } ?: youLabel
                    } else {
                        segment.speakerDisplayName?.takeIf { it.isNotBlank() } ?: participantLabel
                    },
                    isLocal = isLocal,
                    elapsedLabel = startMs?.let { CallDuration.clock(maxOf(0L, segment.capturedAtMs - it) / MILLIS_PER_SECOND) },
                    original = segment.text,
                    translated = translation?.text,
                    translatedLanguage = translation?.language,
                )
            }
    }

    private fun served(segment: PersistedTranscriptSegment, prism: List<String>) =
        PrismTranslationResolver.resolve(
            originalLanguage = segment.language,
            candidates = segment.translations.map { PrismCandidate(it.targetLanguage, it.translatedText) },
            preferredLanguages = prism,
        )

    private const val MILLIS_PER_SECOND = 1_000L
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
        val canShowOriginal: Boolean get() = lines.any { it.translated != null }
    }

    companion object {
        fun of(lines: List<CallTranscriptLine>): CallTranscriptState = if (lines.isEmpty()) Absent else Ready(lines)

        fun forFailure(httpStatus: Int?): CallTranscriptState =
            if (httpStatus in HIDDEN_STATUSES) Absent else Failed

        private val HIDDEN_STATUSES = setOf(403, 404)
    }
}
