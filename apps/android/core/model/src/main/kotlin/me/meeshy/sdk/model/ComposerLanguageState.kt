package me.meeshy.sdk.model

import me.meeshy.sdk.lang.ComposeLanguageDetector

/**
 * Pure SSOT for the composer's live source language — the "smart context zone"
 * behind the chat composer's language pill/picker. Port of iOS `TextAnalyzer`'s
 * language tracking + `ComposerLanguageResolver.resolve`.
 *
 * The value carries three orthogonal facts:
 *  - [detected]: the last confidently detected language, or `null` when the draft
 *    carries no recognizable signal (English, too-short, punctuation-only). It is
 *    deliberately never pinned to a fallback — an unresolved draft leaves the pill
 *    on whatever fallback the reader supplies at display time.
 *  - [manualOverride]: a language the user picked from the picker. It ALWAYS wins
 *    over detection and freezes further analysis, mirroring iOS `languageOverride`.
 *  - [isLocked]: once the draft reaches [WORD_LOCK_THRESHOLD] words with a
 *    confident detection, the language is frozen and re-analysis stops (iOS
 *    `isLanguageLocked`). Emptying the composer releases the lock unless a manual
 *    override is active.
 *
 * Detection is delegated to the already-tested [ComposeLanguageDetector]; this
 * type is only the state machine around it.
 */
public data class ComposerLanguageState(
    val detected: String? = null,
    val manualOverride: String? = null,
    val isLocked: Boolean = false,
) {

    /**
     * The language the pill should show, given the composer's live [fallback]
     * (the reader's resolved content language). Precedence: manual override →
     * detection → fallback — the exact `languageOverride ?? language ?? default`
     * chain of iOS `displayLanguage`.
     */
    public fun display(fallback: String): String = manualOverride ?: detected ?: fallback

    /**
     * Re-derive the state for a new [draft]. A blank draft releases the detection
     * lock (unless a manual override is active); a manual override or an already
     * locked language short-circuits re-analysis; otherwise the draft is detected
     * and the language locks once it crosses [WORD_LOCK_THRESHOLD] words.
     */
    public fun onDraftChanged(draft: String): ComposerLanguageState {
        val trimmed = draft.trim()
        if (trimmed.isEmpty()) {
            return if (manualOverride != null) this else ComposerLanguageState()
        }
        if (manualOverride != null || isLocked) return this

        val result = ComposeLanguageDetector.detect(trimmed, fallback = NO_DETECTION)
        if (result == NO_DETECTION) return this

        val wordCount = WORD_SPLIT.split(trimmed).count { it.isNotBlank() }
        return copy(detected = result, isLocked = wordCount >= WORD_LOCK_THRESHOLD)
    }

    /** Record a language picked from the picker: it wins over detection and freezes analysis. */
    public fun withManualPick(code: String): ComposerLanguageState =
        copy(manualOverride = code, isLocked = true)

    public companion object {
        /** Words typed before the detected language freezes (iOS `wordCountThreshold`). */
        public const val WORD_LOCK_THRESHOLD: Int = 10

        /**
         * A fallback the detector can never return, so a returned value equal to it
         * unambiguously means "no confident detection" — distinct from detecting a
         * language that happens to equal the reader's fallback.
         */
        private const val NO_DETECTION: String = ""

        private val WORD_SPLIT: Regex = Regex("""\s+""")
    }
}
