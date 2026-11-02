package me.meeshy.ui.component.game

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.sdk.model.game.MythicHalo
import me.meeshy.ui.theme.MeeshyPalette
import kotlin.math.roundToInt

/**
 * La couleur d'un rayon : la roue du prisme depuis la teinte de l'émission, ou les jetons du prisme sans émission
 * (miroir de `RankBlasonView.rayColor`).
 */
internal fun mythicRayColor(hue: Int?, index: Int, count: Int): Color {
    if (hue == null) {
        val colors = GameMaterial.prismColors
        return colors[index % colors.size]
    }
    val degrees = (hue + 360.0 * index / maxOf(1, count)).roundToInt() % 360
    return Color.hsl(degrees.toFloat(), 0.8f, 0.56f)
}

/**
 * Le halo du Mythe : la Signature unique de son ÉMISSION (rayons, perles, gemme) autour de l'écu, son numéro gravé
 * dessous. Dans le repère du blason (200 x 184) ; en petit format le numéro se tait.
 */
internal fun DrawScope.drawMythicHalo(halo: MythicHalo, compact: Boolean, numeralColor: Color, measurer: TextMeasurer) {
    halo.rays.forEachIndexed { k, ray ->
        drawLine(
            mythicRayColor(halo.hue, k, halo.rays.size),
            Offset(ray.x1.toFloat(), ray.y1.toFloat()), Offset(ray.x2.toFloat(), ray.y2.toFloat()),
            strokeWidth = halo.rayWidth.toFloat(), cap = StrokeCap.Round,
        )
    }
    halo.beads.forEachIndexed { k, bead ->
        drawCircle(
            mythicRayColor(halo.hue, k * 3, halo.rays.size),
            radius = bead.r.toFloat(), center = Offset(bead.cx.toFloat(), bead.cy.toFloat()),
        )
    }
    halo.gem?.takeIf { it.isNotEmpty() }?.let { gem ->
        val path = Path()
        gem.forEachIndexed { i, p -> if (i == 0) path.moveTo(p.x.toFloat(), p.y.toFloat()) else path.lineTo(p.x.toFloat(), p.y.toFloat()) }
        path.close()
        val bounds: Rect = path.getBounds()
        drawPath(path, GameMaterial.GOLD.brush(bounds))
        drawPath(path, MeeshyPalette.Indigo950.copy(alpha = 0.4f), style = Stroke(0.8f, join = StrokeJoin.Round))
    }
    val numeral = halo.numeral
    if (numeral != null && !compact) {
        drawGameTextOnBaseline(measurer, numeral.text, Offset(numeral.x.toFloat(), numeral.y.toFloat()), numeral.size.toFloat(), numeralColor, FontWeight.ExtraBold)
    }
}
