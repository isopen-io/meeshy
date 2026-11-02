package me.meeshy.sdk.model.composer.look

import kotlin.math.roundToInt
import me.meeshy.sdk.model.AdjustmentFamily
import me.meeshy.sdk.model.AdjustmentKind

/**
 * **Comment se lit un réglage** (iOS `ComposerAdjustCopy.displayValue` + `ComposerMediaAdjustPanel`) : l'auteur lit un
 * ÉCART à l'original de −100 à +100, zéro au neutre, jamais l'unité du filtre (un contraste vit entre 0,5 et 1,5, une
 * exposition entre −2 et +2). Le panneau montre UN réglage à la fois : celui qu'on a touché tant que le média le peint,
 * sinon le premier de la rangée.
 */
public object ComposerAdjustReading {

    public fun displayValue(kind: AdjustmentKind, value: Float): Int {
        val gap = value - kind.neutral
        val travel = if (gap >= 0f) kind.range.endInclusive - kind.neutral else kind.neutral - kind.range.start
        if (travel <= 0f) return 0
        return (gap / travel * 100f).roundToInt()
    }

    public fun signed(read: Int): String = if (read > 0) "+$read" else "$read"

    /** Les curseurs qu'un sous-outil offre à un média : ceux qu'il PEINT (une vidéo n'a ni netteté, ni flou, ni effet). */
    public fun kinds(family: AdjustmentFamily, isVideo: Boolean): List<AdjustmentKind> =
        AdjustmentKind.entries.filter { it.family == family && (!isVideo || it.isServedForVideo) }

    public fun shown(chosen: AdjustmentKind?, among: List<AdjustmentKind>): AdjustmentKind? =
        chosen?.takeIf { it in among } ?: among.firstOrNull()
}
