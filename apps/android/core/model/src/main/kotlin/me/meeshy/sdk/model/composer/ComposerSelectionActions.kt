package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.composer.SceneObjectMenu.Action

/**
 * Les actions libellées d'un élément sélectionné (#13836), dans l'ordre de la maquette : Modifier · Dupliquer · Temps ·
 * Retirer. Aucun Ordre (#13917) : toucher l'objet le fait passer au premier plan.
 */
enum class ComposerSelectionAction {
    EDIT, DUPLICATE, TIME, REMOVE;

    /** La seule qui DÉTRUIT : en couleur d'alerte, rangée en dernier ; l'historique la défait. */
    val isDestructive: Boolean get() = this == REMOVE
}

/**
 * La barre d'actions d'un élément sélectionné (#13836, maquette du 2026-10-30), et le rail droit du grand écran (#13837)
 * qui en reprend la liste : UNE loi pour les deux, et pour le menu de l'appui long, qui n'en est qu'un raccourci. Elle part
 * de ce que [SceneObjectMenu] offre à l'objet — chaque action du menu tombe sur une action de la barre ([of]) — et n'ajoute
 * que ce que le menu ne dit pas : un Modifier câblé par l'hôte ([Input.editable]) et le Temps de tout objet posé (iOS
 * `ComposerSelectionActions.served`, #13902 : `!family.isBackground && !isLocked`, la scène animée ou non). Loi 4 : une
 * action sans effet pour l'objet n'est pas servie.
 */
object ComposerSelectionActions {

    /**
     * [offered] : le menu de l'objet ([SceneObjectMenu.offered]). [editable] : l'hôte a câblé son Modifier (l'écriture
     * d'un texte, la feuille d'un média ou d'un son, l'échange d'un sticker). [timed] : l'objet est POSÉ sur la scène et a
     * sa fenêtre d'apparition propre — un fond, média ou son d'ambiance, dure la slide entière. [isLocked] : l'objet ne se
     * règle pas (le badge d'une republication).
     */
    data class Input(
        val offered: List<Action>,
        val editable: Boolean,
        val timed: Boolean,
        val isLocked: Boolean = false,
    )

    fun served(input: Input): List<ComposerSelectionAction> {
        val fromMenu = input.offered.mapTo(mutableSetOf(), ::of)
        return ComposerSelectionAction.entries.filter { action ->
            when (action) {
                ComposerSelectionAction.EDIT -> input.editable || action in fromMenu
                ComposerSelectionAction.TIME -> input.timed && !input.isLocked
                else -> action in fromMenu
            }
        }
    }

    /** L'action de la barre qui porte [action] du menu : rogner ou faire le fond se règlent dans Modifier. */
    fun of(action: Action): ComposerSelectionAction = when (action) {
        Action.EDIT, Action.TRIM, Action.SET_AS_BACKGROUND, Action.REPLACE_BACKGROUND -> ComposerSelectionAction.EDIT
        Action.DUPLICATE -> ComposerSelectionAction.DUPLICATE
        Action.LEAVE_SCENE, Action.DELETE -> ComposerSelectionAction.REMOVE
    }

    /** Les actions du menu qui se rangent DANS la feuille de Modifier plutôt qu'en sixième bouton : faire le fond, le remplacer. */
    fun editSheetActions(offered: List<Action>): List<Action> =
        offered.filter { it == Action.SET_AS_BACKGROUND || it == Action.REPLACE_BACKGROUND }
}
