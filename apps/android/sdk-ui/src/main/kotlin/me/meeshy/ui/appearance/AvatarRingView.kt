package me.meeshy.ui.appearance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import me.meeshy.sdk.model.appearance.ArcSlice
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.AvatarRingGeometry
import me.meeshy.sdk.model.appearance.AvatarRingOrnamentPath
import me.meeshy.sdk.model.appearance.RingStrokeLayer

/**
 * Le plan de dessin d'un contour, calculé UNE fois par modèle : couches du trait de base et chemins d'ornement
 * déjà lus. Le dessin ne fait ensuite que peindre.
 */
internal class AvatarRingPlan(val design: AvatarRingDesign) {
    val layers: List<RingStrokeLayer> = AvatarRingGeometry.strokeLayers(design)
    val ornaments: List<Ornament> = design.ornamentPaths.map { Ornament(it, svgComposePath(it.d)) }

    class Ornament(val spec: AvatarRingOrnamentPath, val path: Path)
}

/**
 * Peint le contour [plan] dans un carré de côté [side] centré dans la zone de dessin : le viewBox 0 0 100 100, où
 * l'avatar occupe le cercle de rayon 42. Couleurs FIXES — un contour se voit des autres, identique pour tous.
 */
internal fun DrawScope.drawAvatarRing(plan: AvatarRingPlan, side: Float) {
    val unit = side / AvatarRingGeometry.BOX.toFloat()
    val origin = Offset((size.width - side) / 2, (size.height - side) / 2)
    val middle = Offset(origin.x + side / 2, origin.y + side / 2)
    plan.layers.forEach { drawStrokeLayer(it, middle, unit) }
    if (plan.ornaments.isEmpty()) return
    withTransform({
        translate(origin.x, origin.y)
        scale(unit, unit, Offset.Zero)
    }) {
        plan.ornaments.forEach { drawOrnament(plan.design, it) }
    }
}

private fun DrawScope.drawStrokeLayer(layer: RingStrokeLayer, middle: Offset, unit: Float) {
    when (layer) {
        is RingStrokeLayer.Circle -> drawCircle(
            color = appearanceHexColor(layer.colorHex), radius = (layer.radius * unit).toFloat(), center = middle,
            style = Stroke(width = (layer.width * unit).toFloat()),
        )
        is RingStrokeLayer.Dots -> drawCircle(
            color = appearanceHexColor(layer.colorHex), radius = (layer.radius * unit).toFloat(), center = middle,
            style = Stroke(
                width = (layer.width * unit).toFloat(),
                cap = StrokeCap.Round,
                pathEffect = PathEffect.dashPathEffect(floatArrayOf(DOT_LENGTH, (layer.pitch * unit).toFloat())),
            ),
        )
        is RingStrokeLayer.Dashes -> drawCircle(
            color = appearanceHexColor(layer.colorHex), radius = (layer.radius * unit).toFloat(), center = middle,
            style = Stroke(
                width = (layer.width * unit).toFloat(),
                pathEffect = PathEffect.dashPathEffect(floatArrayOf((layer.dash * unit).toFloat(), (layer.gap * unit).toFloat())),
            ),
        )
        is RingStrokeLayer.Sweep -> layer.arcs.forEach { drawArcSlice(it, layer, middle, unit) }
    }
}

private fun DrawScope.drawArcSlice(slice: ArcSlice, layer: RingStrokeLayer.Sweep, middle: Offset, unit: Float) {
    val radius = (layer.radius * unit).toFloat()
    val start = Math.toDegrees(slice.startRadians).toFloat()
    val sweep = Math.toDegrees(slice.endRadians - slice.startRadians).toFloat()
    drawArc(
        color = appearanceHexColor(slice.colorHex),
        startAngle = start,
        sweepAngle = sweep,
        useCenter = false,
        topLeft = Offset(middle.x - radius, middle.y - radius),
        size = Size(radius * 2, radius * 2),
        style = Stroke(width = (layer.width * unit).toFloat()),
    )
}

/** Un trait d'ornement dans le repère du viewBox : son dégradé (en fractions de sa boîte) s'il est lisible, sa couleur sinon. */
private fun DrawScope.drawOrnament(design: AvatarRingDesign, ornament: AvatarRingPlan.Ornament) {
    val spec = ornament.spec
    val colors = design.stroke.colors
    val fallback = appearanceHexColor(colors[spec.color])
    val gradient = spec.gradient?.let { design.gradients.getOrNull(it) }
    val bounds = ornament.path.getBounds()
    val width = spec.width
    val style = if (width != null) Stroke(width = width.toFloat()) else null
    val alpha = spec.opacity.toFloat()
    if (gradient == null || bounds.width <= 0f && bounds.height <= 0f) {
        if (style != null) drawPath(ornament.path, fallback, alpha, style) else drawPath(ornament.path, fallback, alpha)
        return
    }
    val stops = gradient.stops.map { stop ->
        val color = appearanceHexColor(colors.getOrNull(stop.color) ?: "#000000")
        stop.at.toFloat() to color.copy(alpha = color.alpha * (stop.opacity ?: 1.0).toFloat())
    }.toTypedArray()
    val brush = Brush.linearGradient(
        *stops,
        start = Offset(bounds.left + (gradient.x1 * bounds.width).toFloat(), bounds.top + (gradient.y1 * bounds.height).toFloat()),
        end = Offset(bounds.left + (gradient.x2 * bounds.width).toFloat(), bounds.top + (gradient.y2 * bounds.height).toFloat()),
    )
    if (style != null) drawPath(ornament.path, brush, alpha, style) else drawPath(ornament.path, brush, alpha)
}

private const val DOT_LENGTH = 0.001f

/**
 * Un contour d'avatar posé AUTOUR de son contenu dans l'empreinte de l'avatar (spec § 5.2, miroir d'`avatarRingWithin`) :
 * rien ne grandit, rien ne se décale. Le contenu (avatar, anneau de story compris) se ramène au trou du contour et
 * l'anneau de story reste concentrique dedans — le contour et l'anneau restent tous deux visibles. [footprint] est la
 * cote de l'avatar nu, [storyRingSize] l'emprise du contenu quand il porte un anneau de story. `null` ⇒ le contenu tel quel.
 */
@Composable
public fun AvatarRingLayer(
    design: AvatarRingDesign?,
    footprint: Dp,
    modifier: Modifier = Modifier,
    storyRingSize: Dp? = null,
    content: @Composable BoxScope.() -> Unit,
) {
    if (design == null) {
        Box(modifier = modifier, contentAlignment = Alignment.Center, content = content)
        return
    }
    val plan = remember(design) { AvatarRingPlan(design) }
    val factor = AvatarRingGeometry.footprintScale(footprint.value.toDouble(), storyRingSize?.value?.toDouble()).toFloat()
    Box(
        modifier = modifier.drawWithContent {
            drawContent()
            drawAvatarRing(plan, footprint.toPx())
        },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier.graphicsLayer {
                scaleX = factor
                scaleY = factor
            },
            contentAlignment = Alignment.Center,
            content = content,
        )
    }
}
