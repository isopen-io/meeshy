package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.GameLevels
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TierEmblemDesign
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/** La géométrie de l'anneau, en unités d'une boîte de 56 (66 de haut avec des étoiles de Prestige). Pure, donc testée. */
internal object LevelRingGeometry {
    const val BOX: Float = 56f
    const val BOX_WITH_PRESTIGE: Float = 66f
    const val RADIUS: Float = 24f
    const val TRACK_WIDTH: Float = 5f
    const val DISC_RADIUS: Float = 21f
    const val EMBLEM_SIDE: Float = 34f
    const val WATERMARK_OPACITY: Float = 0.18f
    private const val STAR_SPACING = 9f
    const val STAR_Y: Float = 61f
    const val STAR_RADIUS: Float = 4f

    fun clampPrestige(prestige: Int): Int = prestige.coerceIn(0, GameLevels.MAX_PRESTIGE)

    fun aspect(prestige: Int): Float = if (clampPrestige(prestige) > 0) BOX / BOX_WITH_PRESTIGE else 1f

    fun sweepDegrees(progress: Float): Float = 360f * progress.coerceIn(0f, 1f)

    /** L'angle d'une fraction du tour, de midi dans le sens horaire (radians, repère écran). */
    fun angle(fraction: Float): Double = fraction.coerceIn(0f, 1f) * 2 * PI - PI / 2

    /** Les deux extrémités du cran de record : du rayon 20 au rayon 28 depuis le centre (28, 28). */
    fun tick(fraction: Float): Pair<Offset, Offset> {
        val a = angle(fraction)
        val c = BOX / 2
        return Offset(c + 20f * cos(a).toFloat(), c + 20f * sin(a).toFloat()) to
            Offset(c + 28f * cos(a).toFloat(), c + 28f * sin(a).toFloat())
    }

    fun starCenters(prestige: Int): List<Offset> {
        val count = clampPrestige(prestige)
        val first = BOX / 2 - STAR_SPACING * (count - 1) / 2
        return List(count) { Offset(first + it * STAR_SPACING, STAR_Y) }
    }

    fun cartoucheWidth(numeral: String): Float = 6f + numeral.length * 4.4f
}

private val outlineDirections = listOf(
    -1f to 0f, 1f to 0f, 0f to -1f, 0f to 1f, -0.7f to -0.7f, 0.7f to -0.7f, -0.7f to 0.7f, 0.7f to 0.7f,
)

/**
 * L'anneau de niveau : un arc qui se remplit avec la barre du niveau, à la couleur du PALIER, autour d'un disque
 * où l'emblème du palier s'imprime en filigrane, sous le niveau en chiffres arabes et au-dessus du palier en
 * chiffres romains dans un cartouche. Miroir de `LevelRingView` (iOS) et de `level-ring.tsx`.
 *
 * La brique n'anime RIEN d'elle-même : l'hôte pilote [progress] (remplissage 0,6 s, vidage 0,8 s) et [level].
 *
 * @param progress la barre du niveau, de 0 à 1.
 * @param prestige les étoiles de Prestige (0 à 5) sous l'anneau.
 * @param recordMarker la position (0 à 1) du niveau record sur la barre quand on a redescendu ; nul sans repère.
 * @param discColor le disque central, sur lequel l'emblème s'imprime.
 * @param accessibilityLabel nul : décoratif ; l'hôte dit « niveau 34, palier Éclat, quatrième palier ».
 */
@Composable
public fun LevelRing(
    level: Int,
    progress: Float,
    tier: LevelTierKey,
    modifier: Modifier = Modifier,
    prestige: Int = 0,
    recordMarker: Float? = null,
    trackColor: Color = Color.Gray.copy(alpha = 0.25f),
    inkColor: Color = Color.Black,
    discColor: Color = Color.White,
    accessibilityLabel: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val typeScale = rememberGameTypeScale()
    val stars = LevelRingGeometry.clampPrestige(prestige)
    Canvas(
        modifier
            .aspectRatio(LevelRingGeometry.aspect(stars))
            .gameAccessibility(accessibilityLabel),
    ) {
        val k = size.width / LevelRingGeometry.BOX
        scale(k, k, pivot = Offset.Zero) {
            drawRing(tier, progress, recordMarker, trackColor, inkColor, discColor)
            drawGameText(
                measurer, level.toString(), Offset(28f, 26.5f), levelTypeSize(level) * typeScale.factor,
                inkColor, FontWeight.ExtraBold, FontFamily.Default,
            )
            drawCartouche(tier, measurer, inkColor)
            LevelRingGeometry.starCenters(stars).forEach { drawPath(star(it, LevelRingGeometry.STAR_RADIUS), color = GamePalette.gold) }
        }
    }
}

private fun DrawScope.drawRing(
    tier: LevelTierKey,
    progress: Float,
    recordMarker: Float?,
    trackColor: Color,
    inkColor: Color,
    discColor: Color,
) {
    val center = Offset(LevelRingGeometry.BOX / 2, LevelRingGeometry.BOX / 2)
    val r = LevelRingGeometry.RADIUS
    val arcTopLeft = Offset(center.x - r, center.y - r)
    val arcSize = Size(2 * r, 2 * r)
    val width = LevelRingGeometry.TRACK_WIDTH
    drawCircle(trackColor, r, center, style = Stroke(width))
    rotate(-90f, pivot = center) {
        drawArc(
            brush = LevelTierPalette.brush(tier.rank, center),
            startAngle = 0f,
            sweepAngle = LevelRingGeometry.sweepDegrees(progress),
            useCenter = false,
            topLeft = arcTopLeft,
            size = arcSize,
            style = Stroke(width, cap = StrokeCap.Round),
        )
    }
    recordMarker?.let {
        val (from, to) = LevelRingGeometry.tick(it)
        drawLine(inkColor, from, to, strokeWidth = 2f, cap = StrokeCap.Round)
    }
    drawCircle(discColor, LevelRingGeometry.DISC_RADIUS, center)
    drawTierEmblem(tier, center, LevelRingGeometry.EMBLEM_SIDE, discColor, LevelRingGeometry.WATERMARK_OPACITY)
}

private fun DrawScope.drawCartouche(tier: LevelTierKey, measurer: androidx.compose.ui.text.TextMeasurer, ink: Color) {
    val numeral = TierEmblemDesign.roman(tier)
    val w = LevelRingGeometry.cartoucheWidth(numeral)
    val h = 9.4f
    val c = Offset(28f, 40.7f)
    drawRoundRect(
        brush = LevelTierPalette.brush(tier.rank, c),
        topLeft = Offset(c.x - w / 2, c.y - h / 2),
        size = Size(w, h),
        cornerRadius = androidx.compose.ui.geometry.CornerRadius(h / 2, h / 2),
    )
    outlineDirections.forEach { (dx, dy) ->
        drawGameText(measurer, numeral, Offset(c.x + dx * 0.6f, c.y + dy * 0.6f), 6.4f, ink, FontWeight.ExtraBold, FontFamily.Default)
    }
    drawGameText(measurer, numeral, c, 6.4f, Color.White, FontWeight.ExtraBold, FontFamily.Default)
}

private fun star(center: Offset, radius: Float): Path = Path().apply {
    for (step in 0 until 10) {
        val a = step * PI / 5 - PI / 2
        val r = if (step % 2 == 1) radius * 0.45f else radius
        val x = center.x + r * cos(a).toFloat()
        val y = center.y + r * sin(a).toFloat()
        if (step == 0) moveTo(x, y) else lineTo(x, y)
    }
    close()
}


