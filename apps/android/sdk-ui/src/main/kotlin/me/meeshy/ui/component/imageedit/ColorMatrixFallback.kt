package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import me.meeshy.sdk.model.scene.SceneLookMatrix
import me.meeshy.sdk.model.scene.SceneLookPixels
import me.meeshy.sdk.model.scene.SceneLookRecipe

/**
 * Le rendu de repli : celui des appareils sous l'API 33 (RenderScript exclu) ET le rendu de
 * CUISSON de tous les appareils — l'export en pleine résolution et la couverture passent par ici.
 * La chaîne est calculée par [SceneLookPixels] (exposition et température en lumière linéaire,
 * douze filtres, six effets, onze réglages) en UN passage colorimétrique.
 */
public object ColorMatrixFallback {
    /**
     * Rend [recipe] sur [source] et rend un NOUVEAU bitmap ARGB_8888 ; [source] elle-même quand la
     * recette est neutre (aucun rendu, aucune copie). [radiusScale] ramène les rayons d'une copie
     * réduite à ceux de la pleine résolution (1 à l'export).
     */
    public fun render(source: Bitmap, recipe: SceneLookRecipe, radiusScale: Float = 1f): Bitmap {
        if (recipe.isNeutral) return source
        val readable = if (source.config == Bitmap.Config.HARDWARE) {
            source.copy(Bitmap.Config.ARGB_8888, false) ?: return source
        } else {
            source
        }
        val width = readable.width
        val height = readable.height
        val pixels = IntArray(width * height)
        readable.getPixels(pixels, 0, width, 0, 0, width, height)
        val rendered = SceneLookPixels.render(pixels, width, height, recipe, radiusScale)
        return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888).also {
            it.setPixels(rendered, 0, width, 0, 0, width, height)
        }
    }

    /**
     * L'AFFICHAGE immédiat de la couleur d'un look (sans les étages spatiaux) par un filtre de
     * peinture accéléré ; `null` quand la chaîne colorimétrique est neutre.
     */
    public fun displayFilter(recipe: SceneLookRecipe): ColorMatrixColorFilter? {
        val matrix = SceneLookMatrix.composed(recipe)
        if (matrix == me.meeshy.sdk.model.scene.StoryColorMatrix.IDENTITY) return null
        return ColorMatrixColorFilter(ColorMatrix(matrix.values.toFloatArray()))
    }
}
