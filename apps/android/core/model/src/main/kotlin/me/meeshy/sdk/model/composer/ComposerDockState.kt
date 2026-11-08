package me.meeshy.sdk.model.composer

/** Ce qui occupe le bas de l'écran sous la barre de saisie : jamais plus d'une surface à la fois. */
enum class ComposerDockSurface { NONE, KEYBOARD, ATTACHMENT_PANEL, EMOJI_PANEL }

/**
 * L'état du dock du composeur : exclusivité clavier / carrousel de pièces / panneau emoji, et
 * mémoire de la dernière hauteur de clavier mesurée (celle que le panneau reprend).
 */
data class ComposerDockState(
    val surface: ComposerDockSurface = ComposerDockSurface.NONE,
    val lastKeyboardHeightDp: Float? = null,
) {
    val isPanelOpen: Boolean
        get() = surface == ComposerDockSurface.ATTACHMENT_PANEL || surface == ComposerDockSurface.EMOJI_PANEL

    /** Le champ prend le focus, ou on tape dedans : le clavier revient, le panneau se ferme. */
    fun fieldFocused(): ComposerDockState = copy(surface = ComposerDockSurface.KEYBOARD)

    /** Ouvrir le carrousel ferme le clavier ; le rouvrir le referme. */
    fun toggleAttachmentPanel(): ComposerDockState =
        copy(surface = if (surface == ComposerDockSurface.ATTACHMENT_PANEL) ComposerDockSurface.NONE else ComposerDockSurface.ATTACHMENT_PANEL)

    fun toggleEmojiPanel(): ComposerDockState =
        copy(surface = if (surface == ComposerDockSurface.EMOJI_PANEL) ComposerDockSurface.NONE else ComposerDockSurface.EMOJI_PANEL)

    fun closeAll(): ComposerDockState = copy(surface = ComposerDockSurface.NONE)

    /** Le clavier s'est baissé (retour système) : seule sa propre surface retombe, un panneau reste. */
    fun keyboardHidden(): ComposerDockState =
        if (surface == ComposerDockSurface.KEYBOARD) copy(surface = ComposerDockSurface.NONE) else this

    /** Une hauteur de clavier stable est mesurée ; 0 (masqué) ou une trame inutilisable ne la remplace pas. */
    fun keyboardMeasured(heightDp: Float?): ComposerDockState =
        if (heightDp == null || heightDp <= 0f) this else copy(lastKeyboardHeightDp = heightDp)

    /** La hauteur du panneau de pièces : celle du clavier mémorisé, bornée par la loi. */
    fun attachmentPanelHeight(windowWidthDp: Float, windowHeightDp: Float, safeTopDp: Float, safeBottomDp: Float): Float =
        ComposerPanelHeightLaw.restingHeight(lastKeyboardHeightDp, windowWidthDp, windowHeightDp, safeTopDp, safeBottomDp)
}
