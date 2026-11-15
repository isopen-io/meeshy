package me.meeshy.sdk.model.composer

/**
 * Les deux boutons de SCÈNE que le rail gauche porte après ses portes (iOS `ComposerSceneToggle`, #8713) : l'éclair
 * (mode Animé), puis le Cadre. Ce ne sont pas des portes — ils ne font entrer aucune matière — mais des réglages de la scène.
 */
enum class ComposerSceneToggle { ANIMATED, FRAME }

object ComposerLeadingSceneToggles {

    /** L'ordre est celui de la directive — l'éclair, PUIS le Cadre — et ne dépend pas de ce qui est servi. */
    fun served(animated: Boolean, frame: Boolean): List<ComposerSceneToggle> =
        ComposerSceneToggle.entries.filter { toggle ->
            when (toggle) {
                ComposerSceneToggle.ANIMATED -> animated
                ComposerSceneToggle.FRAME -> frame
            }
        }
}
