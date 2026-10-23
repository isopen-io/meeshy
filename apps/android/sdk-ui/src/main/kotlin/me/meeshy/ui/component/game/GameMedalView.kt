package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.text.rememberTextMeasurer
import me.meeshy.sdk.model.game.GameEffectsLaw
import me.meeshy.sdk.model.game.GameMedalGeometry
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Allumée, ou l'EMPREINTE d'une médaille éteinte (une frappe l'a fait redescendre). */
public enum class GameMedalState { Lit, Imprint }

/** Le nombre de perles allumées : Cuivre 1 … Prisme 7. La flamme n'est pas une matière de médaille. */
internal val GameMaterial.medalRank: Int
    get() = when (this) {
        GameMaterial.COPPER -> 1
        GameMaterial.BRONZE -> 2
        GameMaterial.SILVER -> 3
        GameMaterial.GOLD -> 4
        GameMaterial.PLATINUM -> 5
        GameMaterial.OBSIDIAN -> 6
        GameMaterial.PRISM -> 7
        GameMaterial.FLAME -> 0
    }

/** Ce qu'une médaille montre, décidé hors du dessin : le dessin ne fait que le projeter. */
internal data class GameMedalPlan(
    val metal: Boolean,
    val litPearls: Int,
    val ribbon: Boolean,
    val cartouche: String?,
    val imprintLabel: String?,
    val iridescent: Boolean,
) {
    companion object {
        fun of(material: GameMaterial, state: GameMedalState, label: String?): GameMedalPlan {
            val lit = state == GameMedalState.Lit
            val rank = material.medalRank
            val ribbon = lit && GameMedalGeometry.hasRibbon(rank)
            return GameMedalPlan(
                metal = lit,
                litPearls = if (lit) (0 until GameMedalGeometry.PEARL_COUNT).count { GameMedalGeometry.isPearlLit(it, rank) } else 0,
                ribbon = ribbon,
                cartouche = if (ribbon) label else null,
                imprintLabel = if (lit) null else label,
                iridescent = lit && material == GameMaterial.PRISM,
            )
        }
    }
}

private const val BOX_WIDTH = 100f
private const val BOX_HEIGHT = 112f
private val CENTER = Offset(GameMedalGeometry.CENTER_X.toFloat(), GameMedalGeometry.CENTER_Y.toFloat())
private val RADIUS = GameMedalGeometry.BEZEL_RADIUS.toFloat()

/**
 * Une médaille (miroir de `GameMedalView`) : lunette de métal biseautée, champ émaillé à la couleur de la
 * [family], pictogramme [glyph], sept perles de palier, ruban dès l'Or, arc de [progress] vers le palier suivant.
 *
 * - [label] : le seuil du cartouche du ruban (« 100 »), ou ce qu'il manque sous une empreinte (« −37 »).
 * - [surface] / [muted] : le fond et la teinte éteinte de l'empreinte, donnés par l'hôte.
 * - [prismTilt] : l'inclinaison en tours qui irise le prisme ; 0 (fixe) sans mouvement ou sous mouvement réduit.
 * - [accessibilityLabel] : nul = décorative ; l'hôte dit « Messages texte, Or, 100 sur 500 vers Platine ».
 */
@Composable
public fun GameMedalView(
    family: GameMedalFamily,
    glyph: GameMedalGlyph,
    material: GameMaterial,
    modifier: Modifier = Modifier,
    state: GameMedalState = GameMedalState.Lit,
    progress: Double = 1.0,
    label: String? = null,
    surface: Color = Color.White,
    muted: Color = Color.Gray,
    prismTilt: Double = 0.0,
    accessibilityLabel: String? = null,
) {
    val measurer = rememberTextMeasurer()
    val typeScale = rememberGameTypeScale()
    val tilt = GameEffectsLaw.effectiveTilt(prismTilt, LocalReduceMotion.current)
    val plan = GameMedalPlan.of(material, state, label)
    val arc = GameMedalGeometry.clampProgress(progress)
    Canvas(modifier.aspectRatio(BOX_WIDTH / BOX_HEIGHT).gameAccessibility(accessibilityLabel)) {
        val k = size.width / BOX_WIDTH
        scale(k, k, pivot = Offset.Zero) {
            if (plan.metal) {
                drawMedal(family, glyph, material, plan, arc, tilt, muted, measurer, typeScale.sp(7.5f).value)
            } else {
                drawImprint(glyph, plan, surface, muted, measurer, typeScale.sp(10f).value)
            }
        }
    }
}

private fun circleRect(radius: Float) = Rect(CENTER.x - radius, CENTER.y - radius, CENTER.x + radius, CENTER.y + radius)

private fun DrawScope.drawMedal(
    family: GameMedalFamily,
    glyph: GameMedalGlyph,
    material: GameMaterial,
    plan: GameMedalPlan,
    progress: Double,
    tilt: Double,
    muted: Color,
    measurer: androidx.compose.ui.text.TextMeasurer,
    labelSize: Float,
) {
    val enamel = family.enamel
    if (plan.ribbon) drawRibbon(enamel)
    drawArc(enamel, muted, progress)

    val bezel = circleRect(RADIUS + 2)
    drawCircle(material.brush(bezel), radius = RADIUS + 2, center = CENTER)
    drawCircle(GamePalette.ink.copy(alpha = 0.3f), radius = RADIUS + 2, center = CENTER, style = Stroke(1f))
    val lightFrom = Offset(20f, 18f)
    val lightTo = Offset(80f, 86f)
    drawCircle(
        Brush.linearGradient(listOf(Color.White.copy(alpha = 0.75f), Color.White.copy(alpha = 0f)), lightFrom, lightTo),
        radius = RADIUS + 0.6f, center = CENTER, style = Stroke(1.6f),
    )
    drawCircle(
        Brush.linearGradient(listOf(GamePalette.ink.copy(alpha = 0f), GamePalette.ink.copy(alpha = 0.32f)), lightFrom, lightTo),
        radius = RADIUS - 1, center = CENTER, style = Stroke(2.2f),
    )
    drawCircle(Color.White.copy(alpha = 0.55f), radius = RADIUS - 3, center = CENTER, style = Stroke(1.4f))

    val enamelRadius = RADIUS - 7
    drawCircle(enamel, radius = enamelRadius, center = CENTER)
    if (plan.iridescent) {
        rotate(degrees = (tilt * 360.0).toFloat(), pivot = CENTER) {
            drawCircle(
                Brush.sweepGradient(*GamePalette.prismStops.toTypedArray(), center = CENTER),
                radius = enamelRadius, center = CENTER, alpha = 0.5f,
            )
        }
    }
    drawCircle(
        Brush.linearGradient(listOf(Color.White.copy(alpha = 0.18f), Color.White.copy(alpha = 0f)), Offset(50f, 25f), Offset(50f, 79f)),
        radius = enamelRadius, center = CENTER,
    )

    drawGameMedalGlyph(glyph, Color.White, measurer)
    drawPearls(plan.litPearls)
    drawGameSignature(Offset(50f, 80.5f), 13f, material.ink, SignatureStyle.Engraved, 130f)
    plan.cartouche?.let { text ->
        drawRoundRect(
            GamePalette.ink, topLeft = Offset(36f, 99f), size = Size(28f, 11f),
            cornerRadius = androidx.compose.ui.geometry.CornerRadius(3f, 3f),
        )
        drawGameText(measurer, text, Offset(50f, 104.5f), labelSize, Color.White)
    }
}

private fun DrawScope.drawRibbon(color: Color) {
    drawPath(cachedGamePath("M38 74 l-8 30 9-6 5 9 6-30z"), color)
    drawPath(cachedGamePath("M62 74 l8 30 -9-6 -5 9 -6-30z"), color, alpha = 0.85f)
}

/** L'arc extérieur : un rail, et la part parcourue vers le palier suivant, de midi dans le sens horaire. */
private fun DrawScope.drawArc(color: Color, muted: Color, progress: Double) {
    val radius = GameMedalGeometry.ARC_RADIUS.toFloat()
    drawCircle(muted.copy(alpha = 0.35f), radius = radius, center = CENTER, style = Stroke(3f))
    if (progress <= 0.0) return
    if (GameMedalGeometry.isArcComplete(progress)) {
        drawCircle(color, radius = radius, center = CENTER, style = Stroke(3f))
        return
    }
    val path = Path()
    GameMedalGeometry.arcPoints(progress).forEachIndexed { index, p ->
        if (index == 0) path.moveTo(p.x.toFloat(), p.y.toFloat()) else path.lineTo(p.x.toFloat(), p.y.toFloat())
    }
    drawPath(path, color, style = Stroke(width = 3f, cap = StrokeCap.Round, join = StrokeJoin.Round))
}

/** Sept perles sur la lunette, du haut : autant de pleines que la matière a de rang. */
private fun DrawScope.drawPearls(lit: Int) {
    GameMedalGeometry.pearlCenters().forEachIndexed { index, p ->
        val center = Offset(p.x.toFloat(), p.y.toFloat())
        if (index < lit) drawCircle(Color.White, radius = 2.1f, center = center)
        drawCircle(Color.White.copy(alpha = 0.8f), radius = 2.1f, center = center, style = Stroke(1f))
    }
}

private fun DrawScope.drawImprint(
    glyph: GameMedalGlyph,
    plan: GameMedalPlan,
    surface: Color,
    muted: Color,
    measurer: androidx.compose.ui.text.TextMeasurer,
    labelSize: Float,
) {
    drawCircle(surface, radius = RADIUS + 2, center = CENTER)
    drawCircle(
        muted, radius = RADIUS + 2, center = CENTER,
        style = Stroke(width = 2f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(4f, 4f))),
    )
    drawCircle(muted.copy(alpha = 0.35f), radius = RADIUS - 8, center = CENTER, style = Stroke(2f))
    drawGameMedalGlyph(glyph, muted.copy(alpha = muted.alpha * 0.35f), measurer)
    plan.imprintLabel?.let { drawGameText(measurer, it, Offset(50f, 104f), labelSize, muted) }
}
