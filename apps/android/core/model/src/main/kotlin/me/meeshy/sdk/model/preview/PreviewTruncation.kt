package me.meeshy.sdk.model.preview

import java.text.BreakIterator

/**
 * Plafond, en GRAPHÈMES, d'un aperçu de ligne de liste (`lastMessagePreview` et ses traductions).
 * Miroir de `LAST_MESSAGE_PREVIEW_MAX_LENGTH` de la passerelle et de `meeshyPreviewMaxLength` (iOS).
 */
const val LAST_MESSAGE_PREVIEW_MAX_LENGTH: Int = 300

private const val ZWJ = 0x200D
private val VIRAMAS = intArrayOf(
    0x094D, 0x09CD, 0x0A4D, 0x0ACD, 0x0B4D, 0x0BCD, 0x0C4D, 0x0CCD, 0x0D4D, 0x0DCA, 0x1039, 0x17D2,
)

/**
 * Coupe [this] à [maxGraphemes] graphèmes sans jamais scinder un emoji (séquence ZWJ, drapeau,
 * variante) ni une conjonction d'écriture indienne (consonne + virama + consonne). Le
 * `BreakIterator` de la plateforme fait l'essentiel ; une seconde passe recolle ce que les
 * anciennes tables Unicode du JDK scindent encore.
 */
fun String.truncatedToGraphemes(maxGraphemes: Int = LAST_MESSAGE_PREVIEW_MAX_LENGTH): String {
    if (maxGraphemes <= 0) return ""
    if (length <= maxGraphemes) return this
    val clusters = graphemeEnds()
    return if (clusters.size <= maxGraphemes) this else substring(0, clusters[maxGraphemes - 1])
}

/** L'aperçu tel qu'une ligne de liste le rend : plafonné à [LAST_MESSAGE_PREVIEW_MAX_LENGTH]. */
fun String.previewTruncated(): String = truncatedToGraphemes(LAST_MESSAGE_PREVIEW_MAX_LENGTH)

private fun String.graphemeEnds(): List<Int> {
    val iterator = BreakIterator.getCharacterInstance()
    iterator.setText(this)
    val ends = ArrayList<Int>()
    var start = 0
    var end = iterator.next()
    while (end != BreakIterator.DONE) {
        if (ends.isNotEmpty() && glues(previousEnd = start, clusterStart = start)) {
            ends[ends.lastIndex] = end
        } else {
            ends += end
        }
        start = end
        end = iterator.next()
    }
    return ends
}

private fun String.glues(previousEnd: Int, clusterStart: Int): Boolean {
    val last = codePointBefore(previousEnd)
    val first = codePointAt(clusterStart)
    if (last == ZWJ || first == ZWJ) return true
    if (last in VIRAMAS && Character.isLetter(first)) return true
    return isRegionalIndicator(last) && isRegionalIndicator(first) && regionalRun(previousEnd) % 2 == 1
}

private fun isRegionalIndicator(codePoint: Int): Boolean = codePoint in 0x1F1E6..0x1F1FF

private fun String.regionalRun(end: Int): Int {
    var count = 0
    var index = end
    while (index > 0 && isRegionalIndicator(codePointBefore(index))) {
        count++
        index -= Character.charCount(codePointBefore(index))
    }
    return count
}
