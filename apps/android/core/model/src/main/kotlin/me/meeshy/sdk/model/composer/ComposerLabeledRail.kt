package me.meeshy.sdk.model.composer

/**
 * Le rail gauche du grand écran (#13837), ce qu'on AJOUTE à la scène : Fermer, les cinq outils et Fond, toujours ; puis
 * les entrées du « ⋯ » qui tiennent dans sa hauteur, dans leur ordre ; le reste va dans « Plus », qui prend lui-même une
 * rangée et n'existe que s'il range quelque chose. Aucune entrée n'est perdue : ce que le rail ne montre pas, « Plus » le sert.
 */
object ComposerLabeledRail {
    const val ROW = 48f
    const val GAP = 4f

    /** Fermer, les cinq outils, Fond. */
    const val FIXED_ROWS = 7

    val tools: List<ComposerSceneTool> = ComposerSceneTools.column - ComposerSceneTool.MORE

    data class Leading(val inline: List<ComposerMoreEntry>, val overflow: List<ComposerMoreEntry>)

    fun leading(moreEntries: List<ComposerMoreEntry>, railHeightDp: Float): Leading {
        val candidates = moreEntries - ComposerMoreEntry.BACKGROUND
        val free = rowsIn(railHeightDp) - FIXED_ROWS
        if (candidates.size <= free) return Leading(inline = candidates, overflow = emptyList())
        val shown = (free - 1).coerceAtLeast(0)
        return Leading(inline = candidates.take(shown), overflow = candidates.drop(shown))
    }

    private fun rowsIn(heightDp: Float): Int = ((heightDp + GAP) / (ROW + GAP)).toInt().coerceAtLeast(0)
}
