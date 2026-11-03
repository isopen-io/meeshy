package me.meeshy.ui.story.canvas.drawing

import android.graphics.Bitmap
import android.graphics.Canvas
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace

/** Bake des traits en Bitmap transparent (export, couverture, vignette) — miroir de `StoryStrokeRasterizer`. */
public object StrokeRasterizer {

    /**
     * Rend les traits peignables dans un bitmap de [widthPx]×[heightPx] (échelle écran, jamais 1080×1920 sauf
     * demande). `null` s'il n'y a rien à peindre : l'appelant n'ajoute alors aucune couche.
     */
    public fun bitmap(
        strokes: List<StoryDrawingStroke>,
        widthPx: Int,
        heightPx: Int,
        cache: StrokeGeometryCache = StrokeGeometryCache(),
    ): Bitmap? {
        if (widthPx <= 0 || heightPx <= 0) return null
        val ops = StrokeRibbonRenderer.plan(strokes, selectedId = null, cache = cache)
        if (ops.isEmpty()) return null
        val bitmap = Bitmap.createBitmap(widthPx, heightPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bitmap)
        canvas.scale(widthPx / StoryDrawingCanvasSpace.DESIGN_WIDTH, heightPx / StoryDrawingCanvasSpace.DESIGN_HEIGHT)
        StrokeRibbonRenderer.draw(canvas, ops)
        return bitmap
    }
}
