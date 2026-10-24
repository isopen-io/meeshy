package me.meeshy.app.calls

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import me.meeshy.ui.theme.MeeshyMediaChromeColors
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Les jetons de l'écran d'appel : blanc sur un fond sombre ÉPINGLÉ, quel que soit le thème
 * de l'appareil (FaceTime / WhatsApp). Dérivés de [MeeshyPalette] ; aucun ne suit le thème
 * clair, sans quoi les libellés blancs se poseraient sur du blanc.
 */
internal object CallPalette {
    val Base: Color = MeeshyPalette.SurfaceDarkBase
    val Deep: Color = MeeshyPalette.SurfaceDarkDeep
    val Raised: Color = MeeshyPalette.SurfaceDarkRaised

    val Ink: Color = MeeshyMediaChromeColors.OnMedia
    val InkSecondary: Color = MeeshyMediaChromeColors.OnMediaSecondary
    val InkMuted: Color = MeeshyMediaChromeColors.OnMediaMuted

    val Accept: Color = MeeshyPalette.Success
    val Decline: Color = MeeshyPalette.Error
    val Brand: Color = MeeshyPalette.Indigo400
    val BrandDeep: Color = MeeshyPalette.Indigo500

    val Veil: Color = Color.Black

    /** Le dégradé de fond, du coin haut-gauche au coin bas-droit. */
    fun background(): Brush = Brush.linearGradient(listOf(Base, Deep, Raised))

    /** Le voile qui garde le chrome blanc lisible par-dessus le visage du contact. */
    fun veil(): Brush = Brush.verticalGradient(
        listOf(Veil.copy(alpha = 0.7f), Veil.copy(alpha = 0.15f), Veil.copy(alpha = 0.7f)),
    )
}
