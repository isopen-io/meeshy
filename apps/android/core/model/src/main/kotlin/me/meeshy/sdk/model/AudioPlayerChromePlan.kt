package me.meeshy.sdk.model

/**
 * Render posture of the audio player — an OPAQUE parameter: the UI renders whatever
 * posture it is handed, it NEVER decides which posture applies to which row. That
 * decision ("ordinary row vs. elected focal row") lives app-side (SDK purity — same
 * rule as the transcription-language seed). Port of iOS `AudioPlayerChrome`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`).
 */
public enum class AudioPlayerChrome {
    /** Historical rich card: background + border, chips, karaoke block. Every existing call site's default. */
    Card,

    /** Bare strip: play + waveform + duration, a truncated italic "…" flat transcription — nothing else. */
    FlatMinimal,

    /** Enriched bare strip: + speed, progress percentage, translation glyphs/flags, re-transcribe, full transcription. */
    FlatFocused,
}

/**
 * Pure PLAN of the render posture — decides WHO appears, never how. Extracted as a
 * testable value type (same pattern as iOS `AudioPlayerChromePlan`, and the
 * `BubbleRenderKind` precedent here). A pure function of the [AudioPlayerChrome];
 * the Compose chrome that paints these decisions is the coverage-exempt app-side glue.
 */
public data class AudioPlayerChromePlan(
    val showsCardBackground: Boolean,
    val showsRightChips: Boolean,
    val showsLanguageStrip: Boolean,
    val showsRetranscribe: Boolean,
    val showsTranscribeCta: Boolean,
    val rendersFlatTranscription: Boolean,
    /** `null` = whole transcription (elected posture and card). */
    val flatTranscriptionLineLimit: Int?,
    /**
     * The flat transcription FOLLOWS playback (interactive karaoke segments, synchronized
     * highlighting) rather than a static text. Full posture only — the minimal posture keeps
     * its truncated quote (a karaoke cut to 2 lines would have nothing to highlight past the cut).
     */
    val flatTranscriptionFollowsPlayback: Boolean = false,
    /**
     * Karaoke-block cut, in WORDS — `null` = no cut (minimal posture, which has no karaoke but a
     * static quote already bounded in lines). It is a cut on the SEGMENTS, never a line limit:
     * the karaoke highlights segments, so bounding the block height would let the highlight run
     * off-screen. The card posture (bubble mode) keeps its inline 255-char unfold instead.
     */
    val transcriptionWordLimit: Int? = null,
) {
    public companion object {
        /** The ~thirty words — a cut on the flat row alone, sending the rest to fullscreen. */
        public const val STANDARD_TRANSCRIPTION_WORD_LIMIT: Int = 30

        /** Resolves the pure plan for a render [chrome] posture — faithful port of iOS `plan(for:)`. */
        public fun plan(chrome: AudioPlayerChrome): AudioPlayerChromePlan = when (chrome) {
            AudioPlayerChrome.Card -> AudioPlayerChromePlan(
                showsCardBackground = true,
                showsRightChips = true,
                showsLanguageStrip = true,
                showsRetranscribe = true,
                showsTranscribeCta = true,
                rendersFlatTranscription = false,
                flatTranscriptionLineLimit = null,
            )

            AudioPlayerChrome.FlatMinimal -> AudioPlayerChromePlan(
                showsCardBackground = false,
                showsRightChips = false,
                showsLanguageStrip = false,
                showsRetranscribe = false,
                showsTranscribeCta = false,
                rendersFlatTranscription = true,
                flatTranscriptionLineLimit = 2,
            )

            AudioPlayerChrome.FlatFocused -> AudioPlayerChromePlan(
                showsCardBackground = false,
                showsRightChips = true,
                showsLanguageStrip = true,
                showsRetranscribe = true,
                showsTranscribeCta = true,
                rendersFlatTranscription = true,
                flatTranscriptionLineLimit = null,
                flatTranscriptionFollowsPlayback = true,
                transcriptionWordLimit = STANDARD_TRANSCRIPTION_WORD_LIMIT,
            )
        }
    }
}
