package me.meeshy.sdk.model

import kotlin.math.abs

/**
 * La fenêtre de préchargement des médias du fil autour de la rangée visible —
 * miroir de `FeedMediaPrefetcher` (iOS) : [BEHIND] rangées avant, [AHEAD] après
 * (bornes `[i-2, i+7[`), déclenchée [DEBOUNCE_MS] après le dernier défilement et
 * seulement si la rangée a bougé d'au moins [MIN_ROW_GAP] rangées.
 */
public object FeedPrefetchWindow {
    public const val DEBOUNCE_MS: Long = 150L
    public const val MIN_ROW_GAP: Int = 2
    public const val BEHIND: Int = 2
    public const val AHEAD: Int = 7
    public const val NO_PREVIOUS_INDEX: Int = -1

    /**
     * Les indices à précharger autour de [index] dans un fil de [count] rangées.
     * L'indice a pu être pris 150 ms plus tôt : un rafraîchissement qui raccourcit
     * le fil entre-temps ne doit jamais rendre une borne basse au-delà de la haute.
     */
    public fun window(index: Int, count: Int): IntRange {
        val size = count.coerceAtLeast(0)
        val lower = minOf(maxOf(0, index - BEHIND), size)
        val upper = minOf(size, maxOf(lower, index + AHEAD))
        return lower until upper
    }

    /** Vrai quand la rangée [index] s'éloigne assez de [lastIndex] pour justifier un nouveau lot. */
    public fun shouldTrigger(index: Int, lastIndex: Int): Boolean = abs(index - lastIndex) >= MIN_ROW_GAP
}
