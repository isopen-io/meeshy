package me.meeshy.sdk.model.story

/**
 * Ce que le lecteur peint pendant qu'on écrit un commentaire (iOS `StoryComposingFocus`). Le chrome (voiles, barres,
 * en-tête, rail) suit l'immersion ET la saisie ; les décorations du contenu (légende, pastilles audio, lieux) restent
 * peintes en immersion mais se taisent pendant la saisie. Le composeur, la scène et les commentaires ouverts demeurent.
 */
object StoryComposingFocus {
    /** Le fondu : court, sans ressort — on fait de la place, on n'annonce rien. */
    const val FADE_MILLIS: Int = 200

    fun showsChrome(chromeVisible: Boolean, isComposing: Boolean): Boolean = chromeVisible && !isComposing

    fun showsContentDecorations(isComposing: Boolean): Boolean = !isComposing
}
