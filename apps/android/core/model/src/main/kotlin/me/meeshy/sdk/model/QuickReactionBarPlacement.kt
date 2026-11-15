package me.meeshy.sdk.model

/**
 * La barre flottante d'emojis rapides posée SOUS la bulle pressée : sa liste (15 récents), l'instant où
 * « + » s'offre, et sa position verticale.
 */
public object QuickReactionBarPlacement {
    /** Nombre d'emojis récents affichés. */
    public const val RECENT_COUNT: Int = 15

    /** « + » (le sélecteur complet) n'apparaît qu'après ce délai, pour ne pas voler le premier geste. */
    public const val PLUS_REVEAL_DELAY_MILLIS: Long = 350L

    /** Écart entre la bulle et la barre. */
    public const val GAP: Float = 8f

    public enum class Side { BELOW, ABOVE }

    public data class Placement(val side: Side, val top: Float)

    /** Les [RECENT_COUNT] emojis : récents d'abord (sans doublon ni blanc), complétés par les défauts. */
    public fun emojis(recents: List<String>, defaults: List<String>, count: Int = RECENT_COUNT): List<String> =
        (recents + defaults).filter { it.isNotBlank() }.distinct().take(count)

    public fun plusVisible(elapsedMillis: Long): Boolean = elapsedMillis >= PLUS_REVEAL_DELAY_MILLIS

    /** Sous la bulle quand cela tient dans la zone sûre, sinon au-dessus ; jamais hors de [safeTop, safeBottom]. */
    public fun place(
        bubbleTop: Float,
        bubbleBottom: Float,
        barHeight: Float,
        safeTop: Float,
        safeBottom: Float,
    ): Placement {
        val belowTop = bubbleBottom + GAP
        if (belowTop + barHeight <= safeBottom) return Placement(Side.BELOW, belowTop)
        val aboveTop = bubbleTop - GAP - barHeight
        val top = maxOf(safeTop, minOf(aboveTop, safeBottom - barHeight))
        return Placement(Side.ABOVE, top)
    }
}
