package me.meeshy.ui.story.canvas

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.scene.StoryDrawingCanvasSpace
import me.meeshy.ui.theme.hexColor

internal const val SCENE_DRAWING_TAG: String = "scene-drawing"

/** Le trait de l'auteur, en lecture seule, peint au-dessus de tout dans le repère 1080×1920. */
@Composable
internal fun SceneDrawingLayer(strokes: List<StoryDrawingStroke>, modifier: Modifier = Modifier) {
    if (strokes.isEmpty()) return
    Canvas(modifier.fillMaxSize().testTag(SCENE_DRAWING_TAG)) {
        strokes.forEach { stroke ->
            if (stroke.points.size < 2) return@forEach
            val path = Path()
            stroke.points.forEachIndexed { index, point ->
                val x = StoryDrawingCanvasSpace.toScreenX(point.x, size.width)
                val y = StoryDrawingCanvasSpace.toScreenY(point.y, size.height)
                if (index == 0) path.moveTo(x, y) else path.lineTo(x, y)
            }
            drawPath(
                path = path,
                color = hexColor(stroke.colorHex),
                style = Stroke(
                    width = StoryDrawingCanvasSpace.toScreenWidth(stroke.width, size.width),
                    cap = StrokeCap.Round,
                    join = StrokeJoin.Round,
                ),
            )
        }
    }
}
