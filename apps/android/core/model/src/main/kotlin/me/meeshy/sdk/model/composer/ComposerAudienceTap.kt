package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.StoryVisibility

/**
 * Ce que fait un toucher sur un mode d'audience (#13838). Dans le compositeur, l'audience est un RÉGLAGE : un mode touché
 * s'applique et la feuille se ferme, sans « Appliquer » ; un mode à liste (« Seulement… », « Sauf… ») ouvre son sélecteur,
 * et le choix s'applique en le quittant. La republication est une ACTION : un toucher choisit, son bouton publie.
 */
object ComposerAudienceTap {
    enum class Outcome { APPLY_AND_CLOSE, SELECT, PICK_ONLY, PICK_EXCEPT }

    fun outcome(visibility: StoryVisibility, republish: Boolean): Outcome = when {
        visibility == StoryVisibility.ONLY -> Outcome.PICK_ONLY
        visibility == StoryVisibility.EXCEPT -> Outcome.PICK_EXCEPT
        republish -> Outcome.SELECT
        else -> Outcome.APPLY_AND_CLOSE
    }

    fun closesOnPickerDone(republish: Boolean): Boolean = !republish
}
