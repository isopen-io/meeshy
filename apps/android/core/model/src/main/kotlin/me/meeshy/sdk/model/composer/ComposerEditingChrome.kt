package me.meeshy.sdk.model.composer

/**
 * Ce que le compositeur a sous la main, vu de son chrome (#13956) : rien, un objet POSÉ sur la scène (texte, média posé,
 * sticker, lieu, pastille de son), ou le fond média de la diapo, qui pose son propre niveau « Fond » (#13973).
 */
enum class ComposerSelectionSubject { NONE, OBJECT, BACKGROUND }

/** Ce que porte la colonne de la scène, à la même place : les six outils, les options de l'objet sélectionné, le niveau « Fond » du fond sélectionné, ou rien. */
enum class ComposerRailContent { TOOLS, OBJECT_OPTIONS, BACKGROUND_OPTIONS, NONE }

/** Ce que TalkBack dit quand la colonne change de rôle : on entre en édition d'un objet, ou on revient aux outils. */
enum class ComposerEditingAnnouncement { EDITING, TOOLS_BACK }

/**
 * Le chrome visible selon la sélection (#13956, décision porteur du 2026-10-31, spec R6). [close] : Annuler / Fermer ;
 * [publication] : l'audience, Publier, le texte du post et les références ; [sceneControls] : ↶↷, la rangée des diapos et
 * les messages de l'éditeur ; [rail] : ce que porte la colonne ; [editing] : un objet ou le fond est en édition — le fond
 * suit la même grammaire (#13973) : plus de barre à part au-dessus de Publier.
 */
data class ComposerEditingChrome(
    val close: Boolean,
    val publication: Boolean,
    val sceneControls: Boolean,
    val rail: ComposerRailContent,
    val editing: Boolean,
) {
    /** [gestureOpen] : un panneau est monté ou un texte s'écrit — la colonne se tait, l'édition continue. */
    data class Input(
        val subject: ComposerSelectionSubject,
        val drawing: Boolean = false,
        val viewfinderArmed: Boolean = false,
        val gestureOpen: Boolean = false,
    )

    companion object {
        private val REST = ComposerEditingChrome(
            close = true, publication = true, sceneControls = true, rail = ComposerRailContent.TOOLS, editing = false,
        )

        private val QUIET = ComposerEditingChrome(
            close = false, publication = false, sceneControls = false, rail = ComposerRailContent.NONE, editing = false,
        )

        fun resolve(input: Input): ComposerEditingChrome = when {
            input.drawing || input.viewfinderArmed -> QUIET
            input.subject == ComposerSelectionSubject.OBJECT -> editingWith(ComposerRailContent.OBJECT_OPTIONS, input.gestureOpen)
            input.subject == ComposerSelectionSubject.BACKGROUND -> editingWith(ComposerRailContent.BACKGROUND_OPTIONS, input.gestureOpen)
            else -> REST
        }

        private fun editingWith(options: ComposerRailContent, gestureOpen: Boolean) = REST.copy(
            close = false,
            publication = false,
            rail = if (gestureOpen) ComposerRailContent.NONE else options,
            editing = true,
        )

        /** Rien à l'ouverture ; l'édition à chaque sélection d'un objet ; le retour aux outils une fois qu'on en est sorti. */
        fun announcement(previous: ComposerEditingAnnouncement?, editing: Boolean): ComposerEditingAnnouncement? = when {
            editing -> ComposerEditingAnnouncement.EDITING
            previous == null -> null
            else -> ComposerEditingAnnouncement.TOOLS_BACK
        }
    }
}
