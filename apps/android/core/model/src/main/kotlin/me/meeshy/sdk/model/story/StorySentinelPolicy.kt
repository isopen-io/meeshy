package me.meeshy.sdk.model.story

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.carriesUnpaintableContent
import me.meeshy.sdk.model.net.UpgradeRequirement

/**
 * La sentinelle d'un format plus récent — miroir de `StoryViewerView+Sentinel` (iOS). La question se pose
 * au MODÈLE, jamais au rendu : une scène amputée ne se peint pas comme si c'était la composition de l'auteur.
 */
object StorySentinelPolicy {
    fun currentStoryIsUnpaintable(effects: StoryEffects?): Boolean = effects?.carriesUnpaintableContent == true

    /** METTRE À JOUR ouvre la fiche Play Store, la même que la porte de mise à jour. */
    const val STORE_URL: String = UpgradeRequirement.DEFAULT_STORE_URL
}
