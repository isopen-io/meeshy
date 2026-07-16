package me.meeshy.app.chat

/** Outcome of running [LargePasteDetector.detect] over a single composer edit. */
sealed interface PasteDetection {
    /** The edit was ordinary typing — nothing to capture. */
    data object None : PasteDetection

    /** The edit was a large paste, folded into [content]; the composer should clear. */
    data class Captured(val content: ClipboardContent) : PasteDetection
}

/**
 * The composer rule that recognises a sudden large paste and turns it into a
 * clipboard-content attachment (port of the iOS
 * `UniversalComposerBar.handleClipboardCheck`).
 *
 * iOS fires when `newText.count > 2000 && delta > 500`, where its obfuscated
 * `delta = newText.count - (text.count - (newText.count - text.count))` reduces to
 * exactly `2 * (newText.count - text.count)` — twice the single-edit growth. We port
 * the intent with readable thresholds: the composer must have grown past
 * [MIN_TOTAL_LENGTH] characters **and** jumped by more than [MIN_GROWTH] characters
 * in one edit (iOS `500 / 2 = 250`).
 */
object LargePasteDetector {
    /** The composer text must exceed this length for a paste to be captured. */
    const val MIN_TOTAL_LENGTH = 2_000

    /** A single edit must add more than this many characters to count as a paste. */
    const val MIN_GROWTH = 250

    fun isLargePaste(previous: String, current: String): Boolean {
        val growth = current.length - previous.length
        return current.length > MIN_TOTAL_LENGTH && growth > MIN_GROWTH
    }

    fun detect(previous: String, current: String, nowMillis: Long): PasteDetection =
        if (isLargePaste(previous, current)) {
            PasteDetection.Captured(ClipboardContent.of(current, nowMillis))
        } else {
            PasteDetection.None
        }
}
