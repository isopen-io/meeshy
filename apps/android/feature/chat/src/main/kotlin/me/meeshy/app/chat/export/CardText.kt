package me.meeshy.app.chat.export

/** La mesure injectée : la vraie police en production, une règle fixe dans les témoins. */
typealias CardMeasure = (text: String, font: CardFont) -> Double

enum class CardTextDirection { LTR, RTL }

/**
 * LE TEXTE D'UNE CARTE — couper en lignes, tronquer, lire le sens. Lois pures, miroir de
 * `MessageCardText.swift`.
 */
object CardText {

    private const val ELLIPSIS = "…"

    private fun isStrongRtl(cp: Int) = cp in 0x0590..0x08FF || cp in 0xFB1D..0xFDFF || cp in 0xFE70..0xFEFF

    private fun isStrongLtr(cp: Int) =
        cp in 0x41..0x5A || cp in 0x61..0x7A || cp in 0x00C0..0x024F || cp in 0x0370..0x03FF || cp in 0x0400..0x04FF

    /** Le sens d'un texte — celui de son PREMIER caractère fort, comme `dir="auto"`. */
    fun direction(text: String): CardTextDirection {
        var index = 0
        while (index < text.length) {
            val cp = text.codePointAt(index)
            if (isStrongRtl(cp)) return CardTextDirection.RTL
            if (isStrongLtr(cp)) return CardTextDirection.LTR
            index += Character.charCount(cp)
        }
        return CardTextDirection.LTR
    }

    fun nonBlank(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }

    /**
     * Coupe un texte en lignes qui tiennent dans [maxWidth]. Les sauts de ligne de l'auteur sont
     * gardés ; un mot plus large que la ligne (une URL, un mot allemand) est coupé par caractère
     * plutôt que de déborder.
     */
    fun wrap(text: String, maxWidth: Double, font: CardFont, measure: CardMeasure): List<String> {
        fun fits(candidate: String) = measure(candidate, font) <= maxWidth
        val lines = mutableListOf<String>()
        for (paragraph in text.replace("\r\n", "\n").replace('\r', '\n').split('\n')) {
            val words = paragraph.split(Regex("\\s+")).filter { it.isNotEmpty() }
            if (words.isEmpty()) {
                lines.add("")
                continue
            }
            var current = ""
            for (word in words) {
                val candidate = if (current.isEmpty()) word else "$current $word"
                if (fits(candidate)) {
                    current = candidate
                    continue
                }
                if (current.isNotEmpty()) lines.add(current)
                current = ""
                if (fits(word)) {
                    current = word
                    continue
                }
                var index = 0
                while (index < word.length) {
                    val step = Character.charCount(word.codePointAt(index))
                    val piece = word.substring(index, index + step)
                    if (current.isNotEmpty() && !fits(current + piece)) {
                        lines.add(current)
                        current = piece
                    } else {
                        current += piece
                    }
                    index += step
                }
            }
            if (current.isNotEmpty()) lines.add(current)
        }
        while (lines.firstOrNull() == "") lines.removeAt(0)
        while (lines.lastOrNull() == "") lines.removeAt(lines.lastIndex)
        // Deux lignes vides d'affilée n'ajoutent rien à une image : une seule suffit.
        return lines.filterIndexed { index, line -> !(line.isEmpty() && index > 0 && lines[index - 1].isEmpty()) }
    }

    /** Garde [count] lignes et termine la dernière par une ellipse qui tient dans la ligne. */
    fun truncate(lines: List<String>, count: Int, maxWidth: Double, font: CardFont, measure: CardMeasure): List<String> {
        if (lines.size <= count) return lines
        val kept = lines.take(maxOf(1, count)).toMutableList()
        var last = kept.last()
        while (last.isNotEmpty() && measure(last.trimEnd() + ELLIPSIS, font) > maxWidth) last = last.dropLast(1)
        kept[kept.lastIndex] = last.trimEnd() + ELLIPSIS
        return kept
    }
}
