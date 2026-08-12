package me.meeshy.sdk.model.call

/**
 * The live in-call captions button's 3-state cycle: [Off] → [Translated] →
 * [Original] → [Off]. Faithful port of iOS `CaptionsMode`
 * (`apps/ios/Meeshy/Features/Main/Models/CaptionsMode.swift`).
 *
 * Derived from the two authoritative flags the overlay already owns — the
 * transcription service's on/off state and a display-only "show original"
 * toggle — rather than adding a third source of truth.
 */
enum class CaptionsMode {
    /** Captions hidden. */
    Off,

    /** Captions visible, rendered in the viewer's preferred language (the Prisme default). */
    Translated,

    /** Captions visible, rendered as the speaker's original words. */
    Original,
    ;

    /** True while a caption line is on screen (either [Translated] or [Original]). */
    val isShowingCaptions: Boolean
        get() = this != Off

    /**
     * The state one tap advances to. [Translated] is always the entry point when
     * turning captions on — reactivating captions must never land straight on
     * [Original] without the user having asked for it this session.
     */
    val next: CaptionsMode
        get() = when (this) {
            Off -> Translated
            Translated -> Original
            Original -> Off
        }

    companion object {
        /**
         * Derive the mode from the two authoritative flags. [isTranscribing] takes
         * priority: a stale [showOriginalText] left over from a previous activation
         * must never surface [Original] while captions are off.
         */
        fun from(isTranscribing: Boolean, showOriginalText: Boolean): CaptionsMode {
            if (!isTranscribing) return Off
            return if (showOriginalText) Original else Translated
        }
    }
}

/**
 * One live in-call caption utterance — the framework-agnostic subset of an iOS
 * `CallTranscriptSegment` the overlay renders. Purely data; the transport that
 * fills it (edge speech-to-text + NLLB translation) lives app-side.
 */
data class CallCaptionSegment(
    val speakerId: String,
    val speakerName: String,
    val isLocal: Boolean,
    val text: String,
    val translatedText: String? = null,
    val translatedLanguage: String? = null,
)

/**
 * A caption line resolved for display under the current [CaptionsMode]. [text] is
 * exactly what the overlay renders; [isOriginal] flags whether that text is the
 * speaker's own words (so the UI can show a discreet translate indicator only
 * when a translation is actually being shown); [languageCode] is the language of
 * [text] when it is a translation, else `null`.
 */
data class CaptionLine(
    val speakerId: String,
    val speakerName: String,
    val isLocal: Boolean,
    val text: String,
    val isOriginal: Boolean,
    val languageCode: String?,
)

/**
 * The pure SSOT that projects a [CallCaptionSegment] onto the on-screen
 * [CaptionLine] under a [CaptionsMode], following the Prisme Linguistique.
 *
 * Rules:
 *  - [CaptionsMode.Off] never yields a line.
 *  - [CaptionsMode.Translated] shows the translation when one exists, and falls
 *    back to the original words when none does — Prisme rule 1: the absence of a
 *    translation means the content is already in the viewer's language, so we
 *    show the original rather than a blank line.
 *  - [CaptionsMode.Original] always shows the speaker's own words.
 *  - A segment whose selected text is blank yields no line (nothing to render).
 */
object CallCaptionResolver {
    fun resolve(segment: CallCaptionSegment, mode: CaptionsMode): CaptionLine? = when (mode) {
        CaptionsMode.Off -> null
        CaptionsMode.Original -> lineOf(segment, segment.text, isOriginal = true, languageCode = null)
        CaptionsMode.Translated -> {
            val translated = segment.translatedText?.takeUnless { it.isBlank() }
            if (translated != null) {
                lineOf(segment, translated, isOriginal = false, languageCode = segment.translatedLanguage)
            } else {
                lineOf(segment, segment.text, isOriginal = true, languageCode = null)
            }
        }
    }

    fun resolveAll(segments: List<CallCaptionSegment>, mode: CaptionsMode): List<CaptionLine> =
        segments.mapNotNull { resolve(it, mode) }

    private fun lineOf(
        segment: CallCaptionSegment,
        text: String,
        isOriginal: Boolean,
        languageCode: String?,
    ): CaptionLine? {
        if (text.isBlank()) return null
        return CaptionLine(
            speakerId = segment.speakerId,
            speakerName = segment.speakerName,
            isLocal = segment.isLocal,
            text = text,
            isOriginal = isOriginal,
            languageCode = languageCode,
        )
    }
}
