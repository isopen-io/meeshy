package me.meeshy.ui.component.chrome

import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shadow
import androidx.compose.ui.graphics.Shape
import me.meeshy.sdk.model.theme.CanvasChromeScheme
import me.meeshy.sdk.model.theme.ChromeScheme
import me.meeshy.sdk.model.theme.HaloPolarity
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius

/** Le halo d'un glyphe nu : noir sous un glyphe blanc, blanc sous un glyphe sombre. */
public fun legibilityHaloColor(scheme: ChromeScheme): Color = when (CanvasChromeScheme.legibilityHalo(scheme)) {
    HaloPolarity.Black -> Color.Black
    HaloPolarity.White -> Color.White
}

/** L'ombre de halo d'un TEXTE posé sur un canevas (`legibleOverCanvas(on:)`). */
public fun legibilityHaloShadow(scheme: ChromeScheme): Shadow =
    Shadow(
        color = legibilityHaloColor(scheme).copy(alpha = MeeshyOpacity.heavy),
        offset = Offset(0f, 2f),
        blurRadius = 6f,
    )

/**
 * Le halo d'un GLYPHE nu (icône sans verre) : un rayonnement doux de la polarité opposée, étalé
 * derrière lui. C'est le plancher quand des bandes alternées sous un même glyphe ne laissent
 * aucune teinte tenir le contraste.
 */
public fun Modifier.legibilityHalo(scheme: ChromeScheme): Modifier = drawBehind {
    val halo = legibilityHaloColor(scheme)
    val radius = size.maxDimension * HALO_RADIUS_FACTOR
    drawCircle(
        brush = Brush.radialGradient(
            colors = listOf(halo.copy(alpha = MeeshyOpacity.heavy), halo.copy(alpha = 0f)),
            center = center,
            radius = radius,
        ),
        radius = radius,
        center = center,
    )
}

/** Le voile sans bord posé sous un texte de scène : le halo étalé, à 25 %. */
public fun Modifier.sceneTextVeil(
    scheme: ChromeScheme,
    shape: Shape = RoundedCornerShape(MeeshyRadius.md),
): Modifier = background(
    legibilityHaloColor(scheme).copy(alpha = CanvasChromeScheme.SCENE_TEXT_VEIL_OPACITY.toFloat()),
    shape,
)

/** L'encre d'un texte de scène : PRIMAIRE, jamais secondaire. */
public fun sceneTextInk(scheme: ChromeScheme): Color =
    if (scheme == ChromeScheme.Dark) MeeshyPalette.Indigo50 else MeeshyPalette.Indigo950

private const val HALO_RADIUS_FACTOR: Float = 0.9f

