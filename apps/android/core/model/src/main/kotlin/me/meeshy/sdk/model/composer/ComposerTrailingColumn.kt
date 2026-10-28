package me.meeshy.sdk.model.composer

/** Un contrôleur d'outil réduit à ce que la colonne sait peindre (iOS `ComposerToolControl`) : son identité et s'il est déplié. */
data class ComposerToolControl(val id: String, val isExpanded: Boolean)

/**
 * La colonne DROITE du plateau : les options du moment en haut, l'historique en bas (iOS `ComposerTrailingColumn`,
 * `ComposerSceneColumns.swift`). La colonne COMPOSE des inventaires qui existent — les contrôleurs d'un outil, les
 * sections de l'éditeur d'un objet ([ComposerObjectEditorSection]) et les actions d'un objet ([SceneObjectMenu.Action]) —
 * et n'en crée aucun : un réglage n'a donc qu'UN chemin, celui de la colonne.
 */
object ComposerTrailingColumn {

    /** Sur quoi l'auteur agit — un outil ouvert l'emporte sur une sélection : il capture le doigt sur toute la scène. */
    sealed interface Focus {
        /** Rien de touché, aucun outil. */
        data object Scene : Focus

        data class Tool(val controls: List<ComposerToolControl>) : Focus

        /** Un objet en édition en place : ses sections, celle dont les options sont ouvertes, puis ses actions. */
        data class Object(
            val sections: List<ComposerObjectEditorSection>,
            val open: ComposerObjectEditorSection?,
            val actions: List<SceneObjectMenu.Action>,
        ) : Focus
    }

    sealed interface Entry {
        data class ToolControl(val control: ComposerToolControl) : Entry
        data class EditorSection(val section: ComposerObjectEditorSection, val isOpen: Boolean) : Entry
        data class ObjectAction(val action: SceneObjectMenu.Action) : Entry

        /** Le (x) d'un outil : il le termine et rend les portes. */
        data object ExitTool : Entry

        /** Le (x) d'une sélection : il désélectionne et rend les rails de la scène. */
        data object ExitObject : Entry

        /** Le (x) ne défile jamais avec les options. */
        val isExit: Boolean get() = this == ExitTool || this == ExitObject
    }

    /** Le bas de la colonne : TOUJOURS l'historique, sous « Temps » quand la scène est animée et que rien n'est ouvert. */
    enum class Foot { TIME, UNDO, REDO }

    fun focus(
        toolControls: List<ComposerToolControl>?,
        selection: Focus.Object?,
    ): Focus = when {
        toolControls != null -> Focus.Tool(toolControls)
        selection != null -> selection
        else -> Focus.Scene
    }

    /** Les options de HAUT en bas, le (x) en dernier. */
    fun options(focus: Focus): List<Entry> = when (focus) {
        Focus.Scene -> emptyList()
        is Focus.Tool -> focus.controls.map(Entry::ToolControl) + Entry.ExitTool
        is Focus.Object -> {
            val edit = focus.actions.filter { it == SceneObjectMenu.Action.EDIT }
            val rest = focus.actions.filter { action ->
                action != SceneObjectMenu.Action.EDIT &&
                    !(action == SceneObjectMenu.Action.TRIM && ComposerObjectEditorSection.Media(MediaEditTool.TRIM) in focus.sections)
            }
            edit.map(Entry::ObjectAction) +
                focus.sections.map { Entry.EditorSection(it, isOpen = it == focus.open) } +
                rest.map(Entry::ObjectAction) +
                Entry.ExitObject
        }
    }

    /** L'historique reste partout ; « Temps » seulement sans outil ni objet ouvert, et quand la scène est animée. */
    fun foot(focus: Focus, timeServed: Boolean): List<Foot> = when (focus) {
        is Focus.Tool, is Focus.Object -> listOf(Foot.UNDO, Foot.REDO)
        Focus.Scene -> (if (timeServed) listOf(Foot.TIME) else emptyList()) + listOf(Foot.UNDO, Foot.REDO)
    }

    /** Le pied suit les sous-outils, sans ressort, pendant une édition en place ; le dessin garde l'historique au pouce. */
    fun footFollowsOptions(focus: Focus): Boolean = focus is Focus.Object
}
