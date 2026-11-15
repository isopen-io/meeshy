package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Paint
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.DrawStyle
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import me.meeshy.sdk.model.game.GameEngravedBird
import me.meeshy.sdk.model.game.GameEngravedBirdShapes
import me.meeshy.sdk.model.game.GameEngravedBirdShapes.Geometry
import me.meeshy.sdk.model.game.GameEngravedBirdShapes.Shape
import kotlin.math.max

/**
 * Pose Mee ou Meo GRAVÉS au revers de la Meesh (miroir de `GameEngravedBirds.draw`, iOS) : l'ombre BASSE puis la
 * lumière HAUTE — la silhouette décalée, posée en UN calque pour que l'opacité ne se cumule pas là où deux formes se
 * recouvrent —, puis le dessin dans ses couleurs. [origin] est le coin haut-gauche de la boîte de 140, [scale] son
 * rapport ; [flipped] la retourne autour de son bord gauche (posée à droite, elle regarde vers le centre).
 */
internal fun DrawScope.drawEngravedBird(bird: GameEngravedBird, origin: Offset, scale: Float, flipped: Boolean = false) {
    val shapes = GameEngravedBirdShapes.shapes(bird)
    translate(origin.x, origin.y) {
        scale(scaleX = if (flipped) -scale else scale, scaleY = scale, pivot = Offset.Zero) {
            silhouette(shapes, dy = GameEngravedBirdShapes.SHADE_OFFSET.toFloat(), color = birdColor(GameEngravedBirdShapes.SHADE_HEX),
                opacity = GameEngravedBirdShapes.SHADE_OPACITY.toFloat())
            silhouette(shapes, dy = GameEngravedBirdShapes.LIGHT_OFFSET.toFloat(), color = Color.White,
                opacity = GameEngravedBirdShapes.LIGHT_OPACITY.toFloat())
            shapes.forEach { render(it) }
        }
    }
}

private fun birdColor(hex: String): Color = gameHex(hex.toLong(16))

private fun DrawScope.silhouette(shapes: List<Shape>, dy: Float, color: Color, opacity: Float) {
    val box = GameEngravedBirdShapes.BOX.toFloat()
    drawIntoCanvas { canvas ->
        canvas.saveLayer(Rect(-box, -box, box * 2, box * 2), Paint().apply { alpha = opacity })
        translate(0f, dy) {
            shapes.filterNot { it.isHighlight }.forEach { shape ->
                if (shape.fill != null) outline(shape.geometry) { drawShape(shape.geometry, SolidColor(color), Fill) }
                shape.stroke?.let { stroke ->
                    outline(shape.geometry) { drawShape(shape.geometry, SolidColor(color), strokeOf(stroke)) }
                }
            }
        }
        canvas.restore()
    }
}

private fun strokeOf(stroke: GameEngravedBirdShapes.Stroke) =
    Stroke(width = stroke.width.toFloat(), cap = StrokeCap.Round, join = StrokeJoin.Round)

private fun DrawScope.render(shape: Shape) {
    outline(shape.geometry) {
        shape.fill?.let { drawShape(shape.geometry, brushOf(it, boundsOf(shape.geometry)), Fill, shape.opacity.toFloat()) }
        shape.stroke?.let {
            drawShape(shape.geometry, SolidColor(birdColor(it.hex)), strokeOf(it), (shape.opacity * it.opacity).toFloat())
        }
    }
}

/** Une ellipse tournée vit dans SON repère, comme `transform="rotate(a cx cy)"` de SVG : dégradé compris. */
private inline fun DrawScope.outline(geometry: Geometry, block: DrawScope.() -> Unit) {
    if (geometry is Geometry.Ellipse && geometry.rotation != 0.0) {
        rotate(geometry.rotation.toFloat(), Offset(geometry.cx.toFloat(), geometry.cy.toFloat())) { block() }
    } else {
        block()
    }
}

private fun boundsOf(geometry: Geometry): Rect = when (geometry) {
    is Geometry.Circle -> Rect(Offset(geometry.cx.toFloat(), geometry.cy.toFloat()), geometry.r.toFloat())
    is Geometry.Ellipse -> Rect(
        (geometry.cx - geometry.rx).toFloat(), (geometry.cy - geometry.ry).toFloat(),
        (geometry.cx + geometry.rx).toFloat(), (geometry.cy + geometry.ry).toFloat(),
    )
    is Geometry.Path -> cachedGamePath(geometry.d).getBounds()
}

private fun DrawScope.drawShape(
    geometry: Geometry,
    brush: Brush,
    style: DrawStyle,
    alpha: Float = 1f,
) {
    when (geometry) {
        is Geometry.Circle -> drawCircle(brush, geometry.r.toFloat(), Offset(geometry.cx.toFloat(), geometry.cy.toFloat()), alpha, style)
        is Geometry.Ellipse -> {
            val box = boundsOf(geometry)
            drawOval(brush, box.topLeft, Size(box.width, box.height), alpha, style)
        }
        is Geometry.Path -> drawPath(cachedGamePath(geometry.d), brush, alpha, style)
    }
}

private fun brushOf(paint: GameEngravedBirdShapes.Paint, box: Rect): Brush = when (paint) {
    is GameEngravedBirdShapes.Paint.Solid -> SolidColor(birdColor(paint.hex))
    is GameEngravedBirdShapes.Paint.Linear -> Brush.linearGradient(
        listOf(birdColor(paint.first), birdColor(paint.second)),
        start = Offset(box.left + paint.from.x.toFloat() * box.width, box.top + paint.from.y.toFloat() * box.height),
        end = Offset(box.left + paint.to.x.toFloat() * box.width, box.top + paint.to.y.toFloat() * box.height),
    )
    is GameEngravedBirdShapes.Paint.Radial -> Brush.radialGradient(
        listOf(birdColor(paint.inner), birdColor(paint.outer)),
        center = Offset(box.left + paint.center.x.toFloat() * box.width, box.top + paint.center.y.toFloat() * box.height),
        radius = paint.radius.toFloat() * max(box.width, box.height),
    )
}
