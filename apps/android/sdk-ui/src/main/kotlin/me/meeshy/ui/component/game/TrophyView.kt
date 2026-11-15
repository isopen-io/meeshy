package me.meeshy.ui.component.game

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer

/**
 * La géométrie de la coupe (miroir de `TrophyView.swift`, #9380) : une coupe seule tient dans 120 unités, la coupe
 * de Prestige s'élargit à 170 et se décale de 25 pour loger Mee et Meo couronnés de part et d'autre.
 */
internal object TrophyPlan {
    const val HEIGHT: Float = 124f
    const val BOWL_D: String = "M30 12 h60 v22 c0 22 -14 36 -30 38 c-16 -2 -30 -16 -30 -38 z"
    const val HANDLES_D: String = "M30 22 c-17 0 -19 24 3 28 M90 22 c17 0 19 24 -3 28"
    val mee: GameFigureSlot = GameFigureSlot(30f, 88f, 60f)
    val meo: GameFigureSlot = GameFigureSlot(140f, 88f, 60f)
    const val CROWN_HEAD_RATIO: Float = 0.27f
    const val CROWN_SCALE: Float = 1.1f

    fun viewBoxWidth(hasFigures: Boolean): Float = if (hasFigures) 170f else 120f

    fun cupOffset(hasFigures: Boolean): Float = if (hasFigures) 25f else 0f

    fun crownHeads(): List<Offset> =
        listOf(mee, meo).map { Offset(it.centerX, it.centerY - it.side * CROWN_HEAD_RATIO) }
}

/**
 * Une coupe de métal : la Signature frappée sur la panse, une plaque sombre qui porte l'inscription courte
 * [label] (≈ 12 signes, localisée par l'hôte). [material] : or/argent/bronze pour une ligue, platine pour une
 * saison, prisme pour le Prestige, flamme pour le trophée de Flamme. [figures] non nul : Mee et Meo couronnés à
 * la base (Prestige). [accessibilityLabel] nul : décorative.
 */
@Composable
public fun TrophyView(
    material: GameMaterial,
    label: String,
    modifier: Modifier = Modifier,
    figures: GameFigures? = null,
    accessibilityLabel: String? = null,
) {
    val hasFigures = figures != null
    val width = TrophyPlan.viewBoxWidth(hasFigures)
    val measurer = rememberTextMeasurer()
    BoxWithConstraints(modifier.aspectRatio(width / TrophyPlan.HEIGHT).gameAccessibility(accessibilityLabel)) {
        Canvas(Modifier.fillMaxSize()) {
            val k = size.width / width
            withTransform({
                scale(k, k, pivot = Offset.Zero)
                translate(TrophyPlan.cupOffset(hasFigures), 0f)
            }) { drawCup(material, label, measurer) }
        }
        if (figures != null) {
            GameTenantsLayer(figures, viewBoxWidth = width, mee = TrophyPlan.mee, meo = TrophyPlan.meo)
            Canvas(Modifier.fillMaxSize()) {
                val k = size.width / width
                withTransform({ scale(k, k, pivot = Offset.Zero) }) {
                    TrophyPlan.crownHeads().forEach { drawGameCrown(it, TrophyPlan.CROWN_SCALE) }
                }
            }
        }
    }
}

private fun DrawScope.drawCup(material: GameMaterial, label: String, measurer: androidx.compose.ui.text.TextMeasurer) {
    val bowl = cachedGamePath(TrophyPlan.BOWL_D)
    val handles = cachedGamePath(TrophyPlan.HANDLES_D)
    val metal = material.brush(bowl.getBounds())
    drawPath(handles, material.brush(handles.getBounds()), style = Stroke(width = 5f))
    drawPath(bowl, metal)
    drawPath(bowl, GamePalette.ink.copy(alpha = 0.3f), style = Stroke(width = 1f))
    drawRect(metal, Offset(54f, 72f), Size(12f, 16f))
    drawRoundRect(metal, Offset(36f, 88f), Size(48f, 9f), CornerRadius(2f))
    drawRoundRect(GamePalette.ink.copy(alpha = 0.88f), Offset(30f, 97f), Size(60f, 17f), CornerRadius(3f))
    drawGameSignature(Offset(60f, 38f), 42f, material.ink, SignatureStyle.Struck, 100f)
    drawGameTextOnBaseline(
        measurer, label, Offset(60f, 108f), 7.5f, Color.White,
        weight = FontWeight.Medium, family = FontFamily.Monospace, letterSpacing = 1f,
    )
}
