package me.meeshy.sdk.model.story

/**
 * **Quand l'indicateur de chargement d'une story se montre** — iOS `StoryPlaybackStallIndicator`.
 *
 * Un disque discret au centre de la carte quand la timeline est gelée par un média qui bufferise. Il n'apparaît
 * qu'après [SHOW_DELAY_MS] d'attente continue (un hoquet bref ne clignote pas) et disparaît en [FADE_OUT_MS].
 */
public object StoryStallIndicatorLaw {
    public const val DIAMETER_DP: Int = 52
    public const val SHOW_DELAY_MS: Long = 350
    public const val FADE_OUT_MS: Long = 150

    /** Le disque est visible quand l'attente dure depuis au moins [SHOW_DELAY_MS]. */
    public fun isVisible(stalledForMs: Long?): Boolean = stalledForMs != null && stalledForMs >= SHOW_DELAY_MS
}
