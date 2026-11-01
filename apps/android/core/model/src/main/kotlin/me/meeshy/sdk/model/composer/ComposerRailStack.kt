package me.meeshy.sdk.model.composer

/**
 * La colonne en édition, une PILE de niveaux (#13956, grammaire d'édition de la spec R6, #13973) : [root] porte les
 * options de l'objet, chaque réglage plus fin se pose PAR-DESSUS ([pushed]) à la même place, et Retour descend d'un seul
 * niveau ([popped]), jamais sous le premier — la désélection, elle, rend le rail des outils. Les lots suivants y empilent
 * leurs niveaux ([L] est le vocabulaire des niveaux de l'hôte).
 */
data class ComposerRailStack<L>(val root: L, val above: List<L> = emptyList()) {

    val top: L get() = above.lastOrNull() ?: root

    val depth: Int get() = above.size + 1

    val canGoBack: Boolean get() = above.isNotEmpty()

    fun pushed(level: L): ComposerRailStack<L> = if (level == top) this else copy(above = above + level)

    fun popped(): ComposerRailStack<L> = copy(above = above.dropLast(1))
}
