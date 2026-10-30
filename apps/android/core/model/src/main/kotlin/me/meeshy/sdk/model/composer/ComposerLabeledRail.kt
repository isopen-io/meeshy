package me.meeshy.sdk.model.composer

/**
 * Le rail gauche du grand écran (#13837, maquette du 2026-10-30), ce qu'on AJOUTE à la scène : Fermer, les cinq outils et
 * Fond, rien d'autre ; le reste du « ⋯ » attend derrière « Plus », qui n'existe que s'il range quelque chose. La hauteur
 * du rail ne fait rien remonter : le grand écran montre le même jeu que le petit, avec ses libellés. Aucune entrée n'est perdue.
 */
object ComposerLabeledRail {
    const val ROW = 48f
    const val GAP = 4f

    val tools: List<ComposerSceneTool> = ComposerSceneTools.column - ComposerSceneTool.MORE

    fun overflow(moreEntries: List<ComposerMoreEntry>): List<ComposerMoreEntry> = moreEntries - ComposerMoreEntry.BACKGROUND
}
