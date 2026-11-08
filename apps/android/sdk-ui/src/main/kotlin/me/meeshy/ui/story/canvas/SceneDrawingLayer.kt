package me.meeshy.ui.story.canvas

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.ui.story.canvas.drawing.StrokeGeometryCache
import me.meeshy.ui.story.canvas.drawing.StrokeRibbonRenderer

internal const val SCENE_DRAWING_TAG: String = "scene-drawing"

/**
 * Le trait de l'auteur, en lecture seule, dans le repère 1080×1920 projeté sur les bounds (étirement non uniforme,
 * identique à l'aperçu et à l'export). Rubans remplis à largeur variable ; un trait gomme ne se rend jamais.
 */
@Composable
internal fun SceneDrawingLayer(strokes: List<StoryDrawingStroke>, modifier: Modifier = Modifier, selectedId: String? = null) {
    if (strokes.none(StrokeRibbonRenderer::isPaintable)) return
    val cache = remember { StrokeGeometryCache() }
    val ops = remember(strokes, selectedId) { StrokeRibbonRenderer.plan(strokes, selectedId, cache) }
    Canvas(modifier.fillMaxSize().testTag(SCENE_DRAWING_TAG)) {
        drawIntoCanvas { canvas ->
            val native = canvas.nativeCanvas
            native.save()
            native.scale(size.width / StoryDrawingCanvasSpace.DESIGN_WIDTH, size.height / StoryDrawingCanvasSpace.DESIGN_HEIGHT)
            StrokeRibbonRenderer.draw(native, ops)
            native.restore()
        }
    }
}
