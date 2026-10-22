package me.meeshy.sdk.model

/**
 * Borne d'affichage d'un nom d'utilisateur dans les surfaces sociales : jamais plus de 16
 * caractères perçus, l'ellipse signale la coupe (miroir de `DisplayName.truncated` iOS). On compte
 * des GRAPHÈMES, pas des unités UTF-16 : un emoji composé ne se coupe jamais en son milieu.
 */
public object DisplayName {
    public const val MAX_DISPLAY_LENGTH: Int = 16
    private const val ELLIPSIS = "…"

    public fun truncated(name: String, limit: Int = MAX_DISPLAY_LENGTH): String {
        if (limit <= 0) return ""
        val clusters = graphemes(name)
        if (clusters.size <= limit) return name
        return clusters.take(limit).joinToString("").trimEnd() + ELLIPSIS
    }

    internal fun graphemes(text: String): List<String> {
        val result = mutableListOf<String>()
        var index = 0
        while (index < text.length) {
            var end = index + Character.charCount(text.codePointAt(index))
            var previous = text.codePointAt(index)
            var regionalCount = if (isRegional(previous)) 1 else 0
            while (end < text.length) {
                val next = text.codePointAt(end)
                val joinsPrevious = previous == ZWJ
                val extends = isExtender(next)
                val flagPair = isRegional(next) && regionalCount == 1 && isRegional(previous)
                if (!(joinsPrevious || extends || flagPair)) break
                if (flagPair) regionalCount++
                previous = next
                end += Character.charCount(next)
            }
            result += text.substring(index, end)
            index = end
        }
        return result
    }

    private const val ZWJ = 0x200D

    private fun isRegional(cp: Int) = cp in 0x1F1E6..0x1F1FF

    private fun isExtender(cp: Int): Boolean {
        if (cp == ZWJ || cp in 0xFE00..0xFE0F || cp in 0x1F3FB..0x1F3FF || cp in 0xE0020..0xE007F) return true
        return when (Character.getType(cp).toByte()) {
            Character.NON_SPACING_MARK, Character.ENCLOSING_MARK, Character.COMBINING_SPACING_MARK -> true
            else -> false
        }
    }
}
