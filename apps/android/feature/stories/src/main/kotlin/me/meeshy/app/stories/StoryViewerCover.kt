package me.meeshy.app.stories

/**
 * Ce qui recouvre la scène du lecteur. Tout ce qui la recouvre — une feuille (vues,
 * commentaires, envoyer à…), une barre du rail, le menu ⋮, une confirmation — fige
 * l'horloge : rien ne défile derrière ce que l'on est en train de choisir. Un commentaire
 * en cours d'écriture la fige aussi (iOS `StoryComposerHold`, #14313).
 */
data class StoryViewerCover(
    val sheet: Boolean = false,
    val railBar: Boolean = false,
    val menu: Boolean = false,
    val dialog: Boolean = false,
    val composing: Boolean = false,
) {
    val freezesPlayback: Boolean get() = sheet || railBar || menu || dialog || composing
}
