package me.meeshy.app.chat

/**
 * Le clavier se referme quand un menu de message s'ouvre — miroir d'iOS `MessageMenuKeyboard`.
 *
 * Un appui long ouvre un menu ; clavier levé, il s'afficherait derrière lui. Le seul point
 * d'appel [open] relâche le focus qui détient le clavier, QUEL QU'EN SOIT LA SOURCE (champ du
 * composeur, recherche, légende), puis ouvre le menu : tous les chemins du menu passent ici.
 */
internal object MessageMenuKeyboard {
    /** Ferme le clavier (focus + IME) puis ouvre le menu de [messageId]. */
    fun open(messageId: String, dismissKeyboard: () -> Unit, openMenu: (String) -> Unit) {
        dismissKeyboard()
        openMenu(messageId)
    }
}
