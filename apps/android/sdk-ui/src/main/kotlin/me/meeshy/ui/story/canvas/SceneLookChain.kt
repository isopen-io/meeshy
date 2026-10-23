package me.meeshy.ui.story.canvas

import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryFilter
import me.meeshy.sdk.model.StoryMediaKind
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.sdk.model.scene.StoryColorMatrix

/**
 * La chaîne du look d'une slide, en un seul endroit : le filtre de slide, puis les réglages du média
 * de fond, composés en UNE recette. Le lecteur, l'aperçu du composer, la couverture et l'export la
 * lisent : le player EST l'aperçu. Miroir de `StoryBackgroundLook` (iOS).
 */
public object SceneLookChain {
    /** Le filtre de slide, lu depuis son jeton de fil ; `null` si absent ou d'un client plus récent. */
    public fun filterOf(effects: StoryEffects): StoryFilter? = SceneLookRecipe.filterOf(effects)

    /** La recette du fond de ces effets : filtre de slide, puis réglages du média de fond. */
    public fun backgroundRecipe(effects: StoryEffects?): SceneLookRecipe = SceneLookRecipe.forEffects(effects)

    public fun recipe(
        filter: StoryFilter?,
        intensity: Float,
        adjustments: ImageAdjustments?,
        isVideo: Boolean,
    ): SceneLookRecipe = SceneLookRecipe.forStory(filter, intensity, adjustments, isVideo)

    /** Le fond est-il une vidéo ? Un genre inconnu se lit comme une image. */
    public fun isVideo(kind: StoryMediaKind?): Boolean = kind == StoryMediaKind.VIDEO

    /** L'affichage accéléré de la couleur d'une recette ; `null` quand elle est neutre (aucun coût). */
    public fun colorFilter(recipe: SceneLookRecipe): ColorFilter? {
        if (recipe.isNeutral) return null
        val matrix = SceneLookMatrix.composed(recipe)
        if (matrix == StoryColorMatrix.IDENTITY) return null
        return ColorFilter.colorMatrix(ColorMatrix(matrix.values.toFloatArray()))
    }
}
