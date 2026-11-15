package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import me.meeshy.sdk.model.ImageAdjustments
import me.meeshy.sdk.model.scene.SceneLookRecipe
import me.meeshy.ui.story.canvas.SceneLookBakeRequest
import me.meeshy.ui.story.canvas.SceneLookBaker

/**
 * L'étage RÉGLAGES, seul : les réglages d'une image posée dans la scène passent par la MÊME chaîne
 * que l'éditeur (`ImageFilterEngine`), si bien qu'un contraste réglé ici ne peut pas diverger d'un
 * contraste réglé là. Miroir de `ImageAdjustmentStage` / `StoryMediaAdjustmentsProcessor` (iOS).
 */
public object ImageAdjustmentStage {
    /** La recette des seuls réglages, projetée sur ce que le genre du média PEINT. */
    public fun recipe(adjustments: ImageAdjustments?, isVideo: Boolean = false): SceneLookRecipe =
        SceneLookRecipe.forStory(filter = null, intensity = 1f, adjustments = adjustments, isVideo = isVideo)

    /** [image] telle quelle sans réglage actif ; sinon la même image réglée, cuite une fois par valeurs. */
    public fun apply(
        adjustments: ImageAdjustments?,
        image: Bitmap,
        imageId: String,
        baker: SceneLookBaker = SceneLookBaker.shared,
    ): Bitmap = baker.bake(SceneLookBakeRequest(image, imageId, recipe(adjustments)))
}
