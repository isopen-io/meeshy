package me.meeshy.ui.component.imageedit

import android.graphics.Bitmap
import android.graphics.Matrix
import kotlin.math.max
import kotlin.math.roundToInt
import me.meeshy.sdk.model.imageedit.ImageEditState
import me.meeshy.sdk.model.imageedit.ImageFilter
import me.meeshy.sdk.model.imageedit.NormalizedCrop
import me.meeshy.sdk.model.scene.SceneLookRecipe

/**
 * Le moteur de rendu non destructif de l'éditeur d'image. Miroir d'`ImageFilterEngine` (iOS) :
 * orientation puis recadrage CUITS d'abord, couleur ensuite, sur le cadrage final. Le même
 * [render] tourne sur une copie réduite pour l'aperçu et sur l'original intact pour l'export ;
 * seul [referenceLongSide] ramène les rayons de l'aperçu à ceux de la pleine résolution.
 *
 * Sans état d'édition : il ne dessine que des pixels. Les rendus couleur d'une même instance
 * d'image et des mêmes valeurs sont servis par [LookBitmapCache], sans nouveau rendu.
 */
public class ImageFilterEngine(
    private val cache: LookBitmapCache = LookBitmapCache(),
    private val colorRenderer: (Bitmap, SceneLookRecipe, Float) -> Bitmap =
        { bitmap, recipe, scale -> ColorMatrixFallback.render(bitmap, recipe, scale) },
) {
    /**
     * Le pipeline complet : orientation, recadrage, filtre, réglages, effet. [instanceId] identifie
     * l'image affichée (cache) ; [referenceLongSide] est le grand côté de la pleine résolution
     * (l'aperçu passe celui de l'original, l'export laisse la valeur par défaut).
     */
    public fun render(
        source: Bitmap,
        state: ImageEditState,
        instanceId: String? = null,
        referenceLongSide: Int = longSide(source),
    ): Bitmap {
        val recipe = SceneLookRecipe.forEdit(state)
        val signature = signature(state, recipe, referenceLongSide)
        cache.get(source, instanceId, signature)?.let { return it }
        val geometry = renderGeometryOnly(source, state, applyCrop = true)
        val scale = longSide(source).toFloat() / max(referenceLongSide, 1)
        val rendered = if (recipe.isNeutral) geometry else colorRenderer(geometry, recipe, scale)
        cache.put(source, instanceId, signature, rendered)
        return rendered
    }

    /** `true` quand ce rendu est déjà prêt : l'appelant le pose sans lancer de cuisson. */
    public fun cached(
        source: Bitmap,
        state: ImageEditState,
        instanceId: String? = null,
        referenceLongSide: Int = longSide(source),
    ): Bitmap? {
        val recipe = SceneLookRecipe.forEdit(state)
        return cache.get(source, instanceId, signature(state, recipe, referenceLongSide))
    }

    /** Géométrie seule : orientation, miroirs et (au choix) recadrage, sans étage de couleur. */
    public fun renderGeometryOnly(source: Bitmap, state: ImageEditState, applyCrop: Boolean): Bitmap {
        val oriented = orient(source, state.orientationTurns, state.flipHorizontal, state.flipVertical)
        if (!applyCrop) return oriented
        return crop(oriented, state.crop)
    }

    /** Une vignette par filtre, rendue sur une copie réduite déjà cadrée. */
    public fun filterThumbnails(source: Bitmap, maxPixel: Int = 240): Map<ImageFilter, Bitmap> {
        val small = downscaled(source, maxPixel)
        val scale = longSide(small).toFloat() / max(longSide(source), 1)
        return ImageFilter.entries.associateWith { filter ->
            colorRenderer(small, SceneLookRecipe.forEdit(ImageEditState(filter = filter)), scale)
        }
    }

    /** Une copie de [bitmap] dont le grand côté fait au plus [maxPixel] ; l'original s'il est assez petit. */
    public fun downscaled(bitmap: Bitmap, maxPixel: Int): Bitmap {
        val longest = longSide(bitmap)
        if (longest <= maxPixel || longest <= 0) return bitmap
        val ratio = maxPixel.toFloat() / longest
        val w = (bitmap.width * ratio).roundToInt().coerceAtLeast(1)
        val h = (bitmap.height * ratio).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(bitmap, w, h, true)
    }

    private fun orient(bitmap: Bitmap, turns: Int, flipH: Boolean, flipV: Boolean): Bitmap {
        val t = ImageEditState.normalizedTurns(turns)
        if (t == 0 && !flipH && !flipV) return bitmap
        val matrix = Matrix().apply {
            val cx = bitmap.width / 2f
            val cy = bitmap.height / 2f
            if (flipH || flipV) postScale(if (flipH) -1f else 1f, if (flipV) -1f else 1f, cx, cy)
            if (t != 0) postRotate(90f * t, cx, cy)
        }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }

    private fun crop(bitmap: Bitmap, crop: NormalizedCrop?): Bitmap {
        if (crop == null) return bitmap
        val left = (crop.x * bitmap.width).roundToInt().coerceIn(0, bitmap.width - 1)
        val top = (crop.y * bitmap.height).roundToInt().coerceIn(0, bitmap.height - 1)
        val right = ((crop.x + crop.width) * bitmap.width).roundToInt().coerceIn(left + 1, bitmap.width)
        val bottom = ((crop.y + crop.height) * bitmap.height).roundToInt().coerceIn(top + 1, bitmap.height)
        if (left == 0 && top == 0 && right == bitmap.width && bottom == bitmap.height) return bitmap
        return Bitmap.createBitmap(bitmap, left, top, right - left, bottom - top)
    }

    private fun signature(state: ImageEditState, recipe: SceneLookRecipe, referenceLongSide: Int): String =
        "${state.orientationTurns}|${state.flipHorizontal}|${state.flipVertical}|${state.crop}|$referenceLongSide|${recipe.signature()}"

    private fun longSide(bitmap: Bitmap): Int = max(bitmap.width, bitmap.height)
}
