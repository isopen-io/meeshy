package me.meeshy.app.stories

/**
 * The base writing direction of a run of story-caption text — left-to-right (Latin,
 * Cyrillic, CJK, …) or right-to-left (Arabic, Hebrew, Adlam, …).
 */
enum class StoryTextDirection {
    LTR,
    RTL,
}

/**
 * Resolves the base paragraph direction of an on-canvas caption from its content, exactly
 * the way iOS derives a story text object's direction at render time: the wire
 * `StoryTextObject` carries no direction field, so every client re-derives it identically
 * from the text and an Arabic or Hebrew caption lays out right-to-left on all surfaces.
 * This is the single place that decision is made — the composer canvas and any future
 * viewer/reader consume it, so the derivation never drifts between screens.
 *
 * Implements the Unicode Bidirectional Algorithm rules **P2/P3**: scan for the first
 * *strong* character — skipping neutrals, whitespace, digits, punctuation, and the whole
 * content of any directional isolate — and take right-to-left iff that first strong
 * character is right-to-left (R) or right-to-left Arabic (AL). Text with no strong
 * character (empty, digits-only, emoji-only) defaults to [StoryTextDirection.LTR], the
 * UBA's paragraph default.
 */
object StoryTextBidi {
    private const val LRI = 0x2066
    private const val RLI = 0x2067
    private const val FSI = 0x2068
    private const val PDI = 0x2069

    /** The base direction implied by [text]'s first strong character (P2/P3). */
    fun resolveBaseDirection(text: String): StoryTextDirection {
        var isolateDepth = 0
        var index = 0
        while (index < text.length) {
            val codePoint = text.codePointAt(index)
            index += Character.charCount(codePoint)
            when (codePoint) {
                LRI, RLI, FSI -> {
                    isolateDepth++
                    continue
                }
                PDI -> {
                    if (isolateDepth > 0) isolateDepth--
                    continue
                }
            }
            if (isolateDepth > 0) continue
            when (Character.getDirectionality(codePoint)) {
                Character.DIRECTIONALITY_LEFT_TO_RIGHT -> return StoryTextDirection.LTR
                Character.DIRECTIONALITY_RIGHT_TO_LEFT,
                Character.DIRECTIONALITY_RIGHT_TO_LEFT_ARABIC,
                -> return StoryTextDirection.RTL
            }
        }
        return StoryTextDirection.LTR
    }
}
