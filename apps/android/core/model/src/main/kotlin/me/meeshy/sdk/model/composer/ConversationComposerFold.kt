package me.meeshy.sdk.model.composer

/**
 * Le repli de la barre d'une conversation — miroir d'iOS `ConversationComposerFold` (#9955) :
 * dépliée, la barre offre son chevron ⌄ tout à droite de la rangée d'outils, sauf pendant qu'on
 * compose (champ focalisé ou prise vocale) ; repliée, elle laisse un seul bouton bulle centré.
 * Une saisie qui commence (réponse, édition qui demandent le focus) rouvre la barre. Aucune
 * persistance : l'état vit le temps de l'écran.
 */
object ConversationComposerFold {
    /** On compose : le champ a le focus, ou une prise vocale est en cours. */
    fun isComposing(isFocused: Boolean, isRecording: Boolean): Boolean = isFocused || isRecording

    /** Le chevron n'existe que barre dépliée et hors composition. */
    fun offersFoldButton(folded: Boolean, isComposing: Boolean): Boolean = !folded && !isComposing

    /** Une saisie qui commence sur une barre repliée la rouvre. */
    fun reopens(userFolded: Boolean, isComposing: Boolean): Boolean = userFolded && isComposing
}

/** Les portes de droite de la rangée d'outils, qui ne défilent jamais (iOS `ComposerFoldPlacement.TrailingDoor`). */
enum class ComposerTrailingDoor { LIBRARY, CAMERA, FOLD }

object ComposerToolbarDoors {
    /** L'ordre exact d'iOS : photothèque, caméra, puis le chevron dans l'angle droit. */
    fun trailing(offersLibrary: Boolean, offersCamera: Boolean, offersFold: Boolean): List<ComposerTrailingDoor> =
        buildList {
            if (offersLibrary) add(ComposerTrailingDoor.LIBRARY)
            if (offersCamera) add(ComposerTrailingDoor.CAMERA)
            if (offersFold) add(ComposerTrailingDoor.FOLD)
        }
}
