package me.meeshy.sdk.model

/**
 * Le repli d'une légende de média — port de `MediaCaptionRule`
 * (`packages/MeeshySDK/Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift`).
 *
 * Le SEUIL qui décide de replier (30 mots) et la TÊTE montrée alors (15 mots) sont deux
 * nombres : replier une légende de douze mots pour en cacher deux coûterait un geste
 * plus cher que le texte révélé. Les mots se comptent sur les blancs ; un texte sans
 * blanc (japonais, chinois) compte un mot et sort entier.
 */
object MediaCaptionRule {
    const val WORD_THRESHOLD: Int = 30
    const val WORD_HEAD: Int = 15

    data class Folded(val head: String, val isTruncated: Boolean)

    fun collapse(text: String, threshold: Int = WORD_THRESHOLD, head: Int = WORD_HEAD): Folded {
        val words = text.split(Regex("\\s+")).filter { it.isNotEmpty() }
        if (words.size <= threshold || head <= 0) return Folded(text, isTruncated = false)
        return Folded(words.take(head).joinToString(" "), isTruncated = true)
    }
}
