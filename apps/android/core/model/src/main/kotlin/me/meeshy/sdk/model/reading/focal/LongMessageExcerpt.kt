package me.meeshy.sdk.model.reading.focal

/** Résultat de [LongMessageExcerpt.of] : `truncated` faux => `excerpt` est le texte entier. */
data class LongMessageExcerptResult(val truncated: Boolean, val excerpt: String)

/**
 * L'extrait d'un message long — miroir de `packages/shared/utils/long-message.ts` (le
 * TypeScript fait foi) et de `LongMessageExcerpt.swift`, mêmes vecteurs
 * (`fixtures/long-message/excerpt.vectors.json`). Unité = graphème; au-delà de
 * [THRESHOLD] on garde 25 % du texte, coupé au dernier mot, sans ponctuation d'ouverture
 * traînante; sans séparateur utile, coupe brute à la cible. Pas d'ellipse.
 */
object LongMessageExcerpt {
    const val THRESHOLD: Int = 512
    const val RATIO: Double = 0.25

    private val wordSeparators: Set<String> = setOf(" ", "\t", "\n", "\r", "\r\n", "　")
    private val openingPunctuation: Set<String> = setOf(
        "(", "[", "{", "«", "‹", "“", "‘", "„", "¿", "¡", "「", "『", "（", "【", "《", "〈",
    )

    fun isLong(text: String): Boolean = GraphemeClusters.split(text).size > THRESHOLD

    fun of(text: String): LongMessageExcerptResult {
        val graphemes = GraphemeClusters.split(text)
        if (graphemes.size <= THRESHOLD) return LongMessageExcerptResult(false, text)

        val target = Math.floor(RATIO * graphemes.size).toInt()
        val boundary = (1..target).lastOrNull { graphemes[it] in wordSeparators } ?: 0
        val atWord = if (boundary > 0) trimTail(graphemes.subList(0, boundary)) else emptyList()
        val kept = atWord.ifEmpty { graphemes.subList(0, target) }
        return LongMessageExcerptResult(true, kept.joinToString(""))
    }

    private fun trimTail(graphemes: List<String>): List<String> {
        val last = graphemes.indexOfLast { it !in wordSeparators && it !in openingPunctuation }
        return graphemes.subList(0, last + 1)
    }
}

/**
 * Segmentation en graphèmes, déterministe sur JVM comme sur Android (java.text.BreakIterator
 * diffère selon la version du JDK/ICU). Couvre CRLF, marques combinantes, sélecteurs de
 * variation, teintes de peau, séquences ZWJ, drapeaux (paires d'indicateurs régionaux) et
 * étiquettes.
 */
internal object GraphemeClusters {

    fun split(text: String): List<String> {
        val result = ArrayList<String>()
        var start = 0
        var index = 0
        var previous = -1
        var regionalRun = 0
        while (index < text.length) {
            val cp = text.codePointAt(index)
            val next = index + Character.charCount(cp)
            if (previous >= 0 && !breaksBetween(previous, cp, regionalRun)) {
                regionalRun = if (isRegional(cp)) regionalRun + 1 else 0
            } else {
                if (previous >= 0) result.add(text.substring(start, index))
                start = index
                regionalRun = if (isRegional(cp)) 1 else 0
            }
            previous = cp
            index = next
        }
        if (previous >= 0) result.add(text.substring(start))
        return result
    }

    private fun breaksBetween(prev: Int, cp: Int, regionalRun: Int): Boolean = when {
        prev == CR && cp == LF -> false
        prev == CR || prev == LF || isControl(prev) || isControl(cp) -> true
        isExtend(cp) -> false
        prev == ZWJ && isPictographic(cp) -> false
        isRegional(prev) && isRegional(cp) -> regionalRun % 2 == 0
        else -> !isHangulJoin(prev, cp)
    }

    private fun isControl(cp: Int): Boolean =
        cp == CR || cp == LF || Character.getType(cp) == Character.CONTROL.toInt()

    private fun isExtend(cp: Int): Boolean {
        if (cp == ZWJ || cp in 0xFE00..0xFE0F || cp in 0x1F3FB..0x1F3FF || cp in 0xE0020..0xE007F) return true
        return when (Character.getType(cp)) {
            Character.NON_SPACING_MARK.toInt(),
            Character.ENCLOSING_MARK.toInt(),
            Character.COMBINING_SPACING_MARK.toInt(),
            -> true
            else -> false
        }
    }

    private fun isRegional(cp: Int): Boolean = cp in 0x1F1E6..0x1F1FF

    private fun isPictographic(cp: Int): Boolean =
        cp >= 0x1F000 || cp in 0x2190..0x2BFF || cp == 0xA9 || cp == 0xAE || cp == 0x203C || cp == 0x2049

    private fun isHangulJoin(prev: Int, cp: Int): Boolean =
        (prev in 0x1100..0x115F && cp in 0x1100..0x11FF) || (prev in 0x1160..0x11A7 && cp in 0x1160..0x11FF) ||
            (prev in 0x11A8..0x11FF && cp in 0x11A8..0x11FF)

    private const val CR = 0x0D
    private const val LF = 0x0A
    private const val ZWJ = 0x200D
}
