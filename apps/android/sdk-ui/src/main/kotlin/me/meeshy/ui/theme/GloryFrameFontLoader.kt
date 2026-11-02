package me.meeshy.ui.theme

/** La liste FERMÉE des familles qu'un cadre de gloire peut employer (miroir d'iOS). */
public enum class GloryFrameFontFamily(public val displayName: String, internal val variable: Boolean) {
    CINZEL("Cinzel", true),
    CINZEL_DECORATIVE("Cinzel Decorative", false),
    CORMORANT_GARAMOND("Cormorant Garamond", true),
    FRAUNCES("Fraunces", true),
    MANROPE("Manrope", true),
    ;

    /** Le fichier d'asset qui porte la famille ; une famille statique choisit le plus proche. */
    internal fun assetFile(weight: Int, italic: Boolean): String = when (this) {
        CINZEL -> "Cinzel[wght].ttf"
        CINZEL_DECORATIVE -> if (weight >= 800) "CinzelDecorative-Black.ttf" else "CinzelDecorative-Bold.ttf"
        CORMORANT_GARAMOND -> if (italic) "CormorantGaramond-Italic[wght].ttf" else "CormorantGaramond[wght].ttf"
        FRAUNCES -> "Fraunces[SOFT,WONK,opsz,wght].ttf"
        MANROPE -> "Manrope[wght].ttf"
    }

    internal fun weightRange(): IntRange = when (this) {
        CINZEL -> 400..900
        CINZEL_DECORATIVE -> 700..900
        CORMORANT_GARAMOND -> 300..700
        FRAUNCES -> 100..900
        MANROPE -> 200..800
    }

    /** Axes variables appliqués par `Typeface.Builder` ; vide pour une famille statique. */
    internal fun variation(weight: Int, opticalSize: Float): String? = when {
        !variable -> null
        this == FRAUNCES -> "'wght' ${weight.coerceIn(weightRange())}, 'opsz' ${opticalSize.coerceIn(9f, 144f)}, 'SOFT' 0, 'WONK' 0"
        else -> "'wght' ${weight.coerceIn(weightRange())}"
    }

    public companion object {
        public fun fromName(name: String): GloryFrameFontFamily? = entries.firstOrNull { it.displayName == name }
    }
}

/** Quelle écriture porte un texte : ces polices ne couvrent que le latin (D10, miroir d'iOS). */
public object GloryFrameScript {
    private val latin: List<IntRange> = listOf(
        0x0000..0x024F, 0x0250..0x02FF, 0x0300..0x036F, 0x1AB0..0x1AFF, 0x1DC0..0x1DFF,
        0x1E00..0x1EFF, 0x2000..0x206F, 0x20A0..0x20CF, 0x2100..0x214F, 0x2C60..0x2C7F,
        0xA720..0xA7FF, 0xFB00..0xFB06,
    )
    private val emojiInLatinBlocks: Set<Int> = setOf(0x2122, 0x2139)

    /** Vrai si une lettre non latine ou un emoji impose la pile système au texte entier. */
    public fun needsSystemFont(text: String): Boolean =
        text.codePoints().anyMatch { cp -> cp in emojiInLatinBlocks || latin.none { cp in it } }
}

/**
 * Cœur du chargeur, sans dépendance Android : n'ouvre AUCUN asset avant le premier appel, charge
 * une fois par (fichier, variation), et retombe sur [fallback] pour un texte non latin, une famille
 * inconnue ou un échec de chargement — jamais d'exception.
 */
public class GloryFrameFontLoader<T : Any>(
    private val fallback: T,
    private val open: (assetPath: String, variation: String?) -> T?,
) {
    private val cache = HashMap<String, T?>()

    public val loadedCount: Int get() = synchronized(cache) { cache.size }

    public fun resolve(
        familyName: String,
        weight: Int,
        italic: Boolean = false,
        opticalSize: Float = 14f,
        text: String = "",
    ): T {
        val family = GloryFrameFontFamily.fromName(familyName) ?: return fallback
        if (GloryFrameScript.needsSystemFont(text)) return fallback
        val file = family.assetFile(weight, italic)
        val variation = family.variation(weight, opticalSize)
        val key = "$file|$variation"
        return synchronized(cache) {
            if (!cache.containsKey(key)) {
                cache[key] = runCatching { open("$ASSET_DIR/$file", variation) }.getOrNull()
            }
            cache[key] ?: fallback
        }
    }

    public companion object {
        public const val ASSET_DIR: String = "fonts/glory"
    }
}
