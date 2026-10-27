package me.meeshy.app.chat.river

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import kotlin.math.min
import me.meeshy.sdk.model.reading.river.RiverGroupPosition
import me.meeshy.sdk.model.reading.river.RiverLayout
import me.meeshy.sdk.model.reading.river.RiverMetrics

/**
 * Le contour d'une bulle selon sa place dans son groupe (iOS `RiverBubbleOutline`) : seule, fermée des
 * quatre côtés ; en tête, bas ouvert ; au milieu, deux traits droits ; en queue, haut ouvert. Les
 * bords ouverts sont la JOINTURE pointillée avec la bulle voisine, qui la partage.
 */
internal fun riverOutlinePath(position: RiverGroupPosition, size: Size, radius: Float, lineWidth: Float): Path {
    val inset = lineWidth / 2f
    val r = Rect(inset, inset, size.width - inset, size.height - inset)
    val rad = min(radius, min(r.width, r.height) / 2f)
    val d = rad * 2f
    return Path().apply {
        when (position) {
            RiverGroupPosition.SOLO -> addRoundRect(RoundRect(r, CornerRadius(rad)))
            RiverGroupPosition.HEAD -> {
                moveTo(r.left, r.bottom)
                lineTo(r.left, r.top + rad)
                arcTo(Rect(r.left, r.top, r.left + d, r.top + d), 180f, 90f, false)
                lineTo(r.right - rad, r.top)
                arcTo(Rect(r.right - d, r.top, r.right, r.top + d), 270f, 90f, false)
                lineTo(r.right, r.bottom)
            }
            RiverGroupPosition.MIDDLE -> {
                moveTo(r.left, r.top)
                lineTo(r.left, r.bottom)
                moveTo(r.right, r.top)
                lineTo(r.right, r.bottom)
            }
            RiverGroupPosition.TAIL -> {
                moveTo(r.left, r.top)
                lineTo(r.left, r.bottom - rad)
                arcTo(Rect(r.left, r.bottom - d, r.left + d, r.bottom), 180f, -90f, false)
                lineTo(r.right - rad, r.bottom)
                arcTo(Rect(r.right - d, r.bottom - d, r.right, r.bottom), 90f, -90f, false)
                lineTo(r.right, r.top)
            }
        }
    }
}

/** Les coins arrondis de la surface : plats là où la bulle se joint à sa voisine. */
internal fun riverBubbleShape(position: RiverGroupPosition, radius: Dp = RiverMetrics.Bubble.DETOUR_RADIUS.dp): RoundedCornerShape {
    val top = if (position.joinsAbove) 0.dp else radius
    val bottom = if (position.joinsBelow) 0.dp else radius
    return RoundedCornerShape(topStart = top, topEnd = top, bottomEnd = bottom, bottomStart = bottom)
}

/**
 * Le contour et la jointure, dessinés une fois par taille (`drawWithCache`) : en couloirs, le contour
 * coloré à l'épaisseur de la ligne (le bord de la bulle EST un segment de sa branche) ; sérialisé, un
 * trait neutre fin avec la couleur de la voix en bas et à gauche.
 */
internal fun Modifier.riverBubbleOutline(
    position: RiverGroupPosition,
    layout: RiverLayout,
    laneColor: Color,
    neutral: Color,
): Modifier = drawWithCache {
    val line = RiverMetrics.Line.WIDTH.dp.toPx()
    val flat = RiverMetrics.Bubble.FLAT_BORDER_WIDTH.dp.toPx()
    val radius = RiverMetrics.Bubble.DETOUR_RADIUS.dp.toPx()
    val lanes = layout == RiverLayout.LANES
    val path = riverOutlinePath(position, size, radius, if (lanes) line else flat)
    val seam = if (position.joinsAbove) {
        Path().apply { moveTo(0f, 0.5f); lineTo(size.width, 0.5f) }
    } else {
        null
    }
    val seamEffect = PathEffect.dashPathEffect(
        floatArrayOf(RiverMetrics.Row.CONTINUATION_DASH_LENGTH.dp.toPx(), RiverMetrics.Row.CONTINUATION_DASH_GAP.dp.toPx()),
    )
    onDrawWithContent {
        drawContent()
        if (lanes) {
            drawPath(path, laneColor, style = Stroke(line))
        } else {
            drawPath(path, neutral, style = Stroke(flat))
            if (!position.joinsBelow) drawRect(laneColor, topLeft = androidx.compose.ui.geometry.Offset(0f, size.height - line), size = Size(size.width, line))
            drawRect(laneColor, size = Size(line, size.height))
        }
        if (seam != null) drawPath(seam, laneColor.copy(alpha = 0.55f), style = Stroke(1.dp.toPx(), pathEffect = seamEffect))
    }
}
