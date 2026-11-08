package me.meeshy.sdk.model.composer

/**
 * Ce que le rail de gauche montre à l'instant (iOS `ComposerRailMode`) : les PORTES, ou — un outil ouvert — ses
 * CONTRÔLEURS. Le dessin l'emporte sur l'édition d'un texte : il capture le doigt sur toute la scène.
 */
sealed interface ComposerRailMode {
    data class Doors(val doors: List<ComposerRailDoor>) : ComposerRailMode
    data class Tool(val controls: List<ComposerToolControl>) : ComposerRailMode

    val opensTool: Boolean get() = this is Tool

    companion object {
        fun resolve(
            drawingControls: List<ComposerToolControl>?,
            textControls: List<ComposerToolControl>?,
            doors: List<ComposerRailDoor>,
        ): ComposerRailMode = (drawingControls ?: textControls)?.let(::Tool) ?: Doors(doors)
    }
}

/**
 * Qui reste peint quand un outil s'ouvre (iOS `ComposerToolFocus`) : un seul sujet à la fois. Les contrôleurs de l'outil
 * remplacent les portes, la barre du haut, le socle, la trace sonore et le descriptif ; la colonne de droite reste (elle
 * porte l'historique et le (x)).
 */
object ComposerToolFocus {

    enum class Chrome { TOP_BAR, SCENE_DOORS, TRAILING_RAIL, SOCLE, SOUND_TRACE, DESCRIPTION, TOOL_CONTROLS }

    /** Un outil est ouvert dès que le rail l'ouvre OU qu'un objet s'édite en place. */
    fun toolIsOpen(railOpensTool: Boolean, editsInline: Boolean): Boolean = railOpensTool || editsInline

    fun isShown(chrome: Chrome, toolIsOpen: Boolean): Boolean = when (chrome) {
        Chrome.TOOL_CONTROLS -> toolIsOpen
        Chrome.TRAILING_RAIL -> true
        Chrome.TOP_BAR, Chrome.SCENE_DOORS, Chrome.SOCLE, Chrome.SOUND_TRACE, Chrome.DESCRIPTION -> !toolIsOpen
    }

    /** Pendant qu'on écrit, le clavier est le seul sujet : portes, colonne de droite et socle s'effacent. */
    fun isShown(chrome: Chrome, toolIsOpen: Boolean, writing: ComposerWriting): Boolean {
        if (chrome == Chrome.DESCRIPTION && writing == ComposerWriting.POST_BODY) return false
        if (!writing.writesText) return isShown(chrome, toolIsOpen)
        return when (chrome) {
            Chrome.SCENE_DOORS, Chrome.TRAILING_RAIL, Chrome.SOCLE -> false
            else -> isShown(chrome, toolIsOpen)
        }
    }
}

/** Ce qui s'écrit au clavier : rien, la légende de la scène, ou le corps du post (iOS `ComposerWriting`). */
enum class ComposerWriting {
    NOTHING, SCENE_LEGEND, POST_BODY;

    val writesText: Boolean get() = this != NOTHING

    companion object {
        fun resolve(editsSceneDescription: Boolean, editsPostContent: Boolean): ComposerWriting = when {
            editsPostContent -> POST_BODY
            editsSceneDescription -> SCENE_LEGEND
            else -> NOTHING
        }
    }
}
