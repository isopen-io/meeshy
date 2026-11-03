package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.composer.scene.StoryFitMode

/** Comment un média de fond occupe la scène : il la remplit en rognant, ou tient entier dans ses bandes. */
enum class SceneBackgroundFit { FILL, FIT }

/**
 * Le mode d'ajustement d'un fond (iOS `resolveVideoGravity` / `resolveImageGravity`). `"fit"` et `"fill"` forcés par
 * l'auteur sont respectés ; sans choix (mode libre) le fond REMPLIT — l'iOS a retiré l'auto-pick par orientation (le fond
 * « se cachait » derrière sa propre bande quand le bitmap arrivait). La variante par orientation reste disponible pour un
 * hôte qui la demande : [autoByOrientation] remplit en portrait et ajuste un média plus large que la scène.
 */
object SceneBackgroundFitLaw {
    fun resolve(
        override: String?,
        mediaAspect: Double? = null,
        canvasAspect: Double = StoryBackgroundObjectTransform.SCENE_ASPECT,
        autoByOrientation: Boolean = false,
    ): SceneBackgroundFit = when (override) {
        StoryFitMode.FIT -> SceneBackgroundFit.FIT
        StoryFitMode.FILL -> SceneBackgroundFit.FILL
        else -> if (autoByOrientation && isLandscapeFor(mediaAspect, canvasAspect)) SceneBackgroundFit.FIT else SceneBackgroundFit.FILL
    }

    private fun isLandscapeFor(mediaAspect: Double?, canvasAspect: Double): Boolean =
        mediaAspect != null && mediaAspect.isFinite() && mediaAspect > canvasAspect
}
