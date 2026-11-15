package me.meeshy.sdk.model.search

import java.text.Normalizer

/**
 * The folded form of a string plus, for each folded char, the index of the
 * ORIGINAL char that produced it. The array is index-aligned with [folded]
 * (`sourceIndexOf.size == folded.length`), letting a match found in folded space
 * be projected back onto the original string even when folding changes the
 * length (accents dropped, marks removed). Not a data class: it carries an
 * [IntArray], and it is only ever read field-by-field, never compared.
 */
public class FoldedText(
    public val folded: String,
    public val sourceIndexOf: IntArray,
)

/**
 * Accent- and case-insensitive text folding — the Android port of the iOS
 * `.folding(options: [.diacriticInsensitive, .caseInsensitive])` used for search
 * matching/highlighting and library filtering. A "fold" NFD-decomposes the text,
 * drops combining marks (`\p{Mn}`), and lowercases — so `Café` and `cafe` fold to
 * the same key, and a query typed without accents still matches accented text.
 *
 * Pure, stateless building block: no locale coupling (Unicode default casing),
 * no state, no I/O.
 */
public object SearchTextFolder {

    private val combiningMarks = Regex("\\p{Mn}+")

    /** The accent- and case-insensitive fold of [text]. */
    public fun fold(text: String): String = foldWithMap(text).folded

    /**
     * Fold [text] while recording, for each folded char, the source char index in
     * [text]. Combining marks contribute no folded char, so the folded char that
     * follows one maps to the source index PAST the mark — which is exactly what a
     * caller needs to extend a highlight over a decomposed grapheme's trailing
     * marks. Folding is done per source char so the index map stays exact; the
     * resulting [FoldedText.folded] is identical to [fold] on the same input.
     */
    public fun foldWithMap(text: String): FoldedText {
        val folded = StringBuilder(text.length)
        val map = ArrayList<Int>(text.length)
        for (i in text.indices) {
            val fragment = foldChar(text[i])
            for (c in fragment) {
                folded.append(c)
                map.add(i)
            }
        }
        return FoldedText(folded.toString(), map.toIntArray())
    }

    private fun foldChar(char: Char): String {
        val decomposed = Normalizer.normalize(char.toString(), Normalizer.Form.NFD)
        return combiningMarks.replace(decomposed, "").lowercase()
    }
}
