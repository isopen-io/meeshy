package me.meeshy.ui.story.canvas

import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryColorMatrix

/**
 * Le look d'une VIDÉO posée : une composition d'effets par trame, sans netteté ni flou
 * (`served(isVideo)`), et RIEN du tout — aucune composition, aucun coût par trame — quand la
 * projection est neutre. Miroir de `StoryVideoAdjustmentsProcessor` (iOS).
 *
 * Cet objet porte la DÉCISION et la matrice par trame ; la pose de l'effet sur le lecteur vidéo
 * se branche sur [colorMatrixOrNull] (une couture inerte tant que rien ne la lit).
 */
public object SceneVideoLookEffect {
    /** La recette que cette vidéo peint, `null` quand il n'y a rien à peindre. */
    public fun paintedRecipe(adjustments: ImageAdjustments?): SceneLookRecipe? {
        val recipe = SceneLookChain.recipe(filter = null, intensity = 1f, adjustments = adjustments, isVideo = true)
        return recipe.takeUnless { it.isNeutral }
    }

    /** La matrice 4×5 à poser sur chaque trame ; `null` ⇒ la vidéo passe par le chemin natif. */
    public fun colorMatrixOrNull(recipe: SceneLookRecipe?): StoryColorMatrix? {
        if (recipe == null || recipe.isNeutral) return null
        return SceneLookMatrix.composed(recipe).takeUnless { it == StoryColorMatrix.IDENTITY }
    }
}
