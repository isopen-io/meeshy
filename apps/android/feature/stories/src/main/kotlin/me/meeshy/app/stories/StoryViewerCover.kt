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
    /** Légende dépliée ou transcription demandée : la story boucle au lieu d'avancer, sans se figer. */
    val reading: Boolean = false,
    /** L'interlude d'identité est affiché : la story du nouvel auteur attend, et n'est vue qu'après lui. */
    val groupIntro: Boolean = false,
    /** La fiche profil d'une personne touchée est ouverte par-dessus le lecteur : il reprend à sa fermeture. */
    val profile: Boolean = false,
) {
    val freezesPlayback: Boolean get() = sheet || railBar || menu || dialog || composing || groupIntro || profile
}
