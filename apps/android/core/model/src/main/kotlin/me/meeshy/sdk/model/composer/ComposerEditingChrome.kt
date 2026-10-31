package me.meeshy.sdk.model.composer

/**
 * Ce que le compositeur a sous la main, vu de son chrome (#13956) : rien, un objet POSÉ sur la scène (texte, média posé,
 * sticker, lieu, pastille de son), ou le fond de la diapo — qui n'entre jamais dans la règle de l'édition.
 */
enum class ComposerSelectionSubject { NONE, OBJECT, BACKGROUND }

/** Ce que porte la colonne de la scène, à la même place : les six outils, les options de l'objet sélectionné, ou rien. */
enum class ComposerRailContent { TOOLS, OBJECT_OPTIONS, NONE }

/** Ce que TalkBack dit quand la colonne change de rôle : on entre en édition d'un objet, ou on revient aux outils. */
enum class ComposerEditingAnnouncement { EDITING, TOOLS_BACK }

/**
 * Le chrome visible selon la sélection (#13956, décision porteur du 2026-10-31, spec R6). [close] : Annuler / Fermer ;
 * [publication] : l'audience, Publier, le texte du post et les références ; [sceneControls] : ↶↷, la rangée des diapos et
 * les messages de l'éditeur ; [rail] : ce que porte la colonne ; [editing] : un objet est en édition ; [backgroundBar] : la
 * barre d'actions du fond, posée au-dessus de Publier comme avant, puisque le fond n'est pas un objet de la scène.
 */
data class ComposerEditingChrome(
    val close: Boolean,
    val publication: Boolean,
    val sceneControls: Boolean,
    val rail: ComposerRailContent,
    val editing: Boolean,
    val backgroundBar: Boolean,
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
            close = true, publication = true, sceneControls = true, rail = ComposerRailContent.TOOLS, editing = false, backgroundBar = false,
        )

        private val QUIET = ComposerEditingChrome(
            close = false, publication = false, sceneControls = false, rail = ComposerRailContent.NONE, editing = false, backgroundBar = false,
        )

        fun resolve(input: Input): ComposerEditingChrome = when {
            input.drawing || input.viewfinderArmed -> QUIET
            input.subject == ComposerSelectionSubject.OBJECT -> REST.copy(
                close = false,
                publication = false,
                rail = if (input.gestureOpen) ComposerRailContent.NONE else ComposerRailContent.OBJECT_OPTIONS,
                editing = true,
            )
            input.subject == ComposerSelectionSubject.BACKGROUND -> REST.copy(rail = ComposerRailContent.NONE, backgroundBar = !input.gestureOpen)
            else -> REST
        }

        /** Rien à l'ouverture ; l'édition à chaque sélection d'un objet ; le retour aux outils une fois qu'on en est sorti. */
        fun announcement(previous: ComposerEditingAnnouncement?, editing: Boolean): ComposerEditingAnnouncement? = when {
            editing -> ComposerEditingAnnouncement.EDITING
            previous == null -> null
            else -> ComposerEditingAnnouncement.TOOLS_BACK
        }
    }
}
