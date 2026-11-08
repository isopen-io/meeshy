package me.meeshy.ui.story.canvas

import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.graphics.Path
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry
import me.meeshy.sdk.model.scene.StoryTextFrameGeometry.Primitive
import me.meeshy.sdk.model.scene.StoryTextFrameShape

/** Le tracé de la forme, en pixels : chaque sous-tracé est ajouté tel quel (remplissage `nonzero`, comme iOS). */
public fun List<Primitive>.toPath(pxPerDesign: Float): Path {
    val k = pxPerDesign.toDouble()
    val path = Path()
    forEach { primitive ->
        when (primitive) {
            is Primitive.RoundRect -> path.addRoundRect(
                RoundRect(
                    Rect((primitive.left * k).toFloat(), (primitive.top * k).toFloat(), ((primitive.left + primitive.width) * k).toFloat(), ((primitive.top + primitive.height) * k).toFloat()),
                    CornerRadius((primitive.radius * k).toFloat()),
                ),
            )
            is Primitive.Oval -> path.addOval(
                Rect((primitive.left * k).toFloat(), (primitive.top * k).toFloat(), ((primitive.left + primitive.width) * k).toFloat(), ((primitive.top + primitive.height) * k).toFloat()),
            )
            is Primitive.Polygon -> primitive.points.forEachIndexed { index, (x, y) ->
                if (index == 0) path.moveTo((x * k).toFloat(), (y * k).toFloat()) else path.lineTo((x * k).toFloat(), (y * k).toFloat())
                if (index == primitive.points.lastIndex) path.close()
            }
        }
    }
    return path
}

/** Les trois formes qui se tracent par chemin : losange, nuage et bulle de BD (iOS `usesCustomPath`). */
public val StoryTextFrameShape.usesCustomPath: Boolean
    get() = this == StoryTextFrameShape.DIAMOND || this == StoryTextFrameShape.CLOUD || this == StoryTextFrameShape.SPEECH

/** Le chemin du cadre d'une boîte de [widthPx] × [heightPx] pixels, pour [pxPerDesign] pixels par design-pixel. */
public fun sceneTextFramePath(shape: StoryTextFrameShape, widthPx: Float, heightPx: Float, pxPerDesign: Float): Path {
    val k = pxPerDesign.toDouble()
    if (k <= 0.0 || !k.isFinite()) return Path()
    return StoryTextFrameGeometry.primitives(shape, widthPx / k, heightPx / k).toPath(pxPerDesign)
}

/** La forme du cadre comme [Shape] Compose : le flou du verre épouse le tracé, pas sa boîte (iOS : masque `CAShapeLayer`). */
internal class FrameShape(private val shape: StoryTextFrameShape, private val pxPerDesign: Float) : androidx.compose.ui.graphics.Shape {
    override fun createOutline(
        size: androidx.compose.ui.geometry.Size,
        layoutDirection: androidx.compose.ui.unit.LayoutDirection,
        density: androidx.compose.ui.unit.Density,
    ): androidx.compose.ui.graphics.Outline =
        androidx.compose.ui.graphics.Outline.Generic(sceneTextFramePath(shape, size.width, size.height, pxPerDesign))
}
