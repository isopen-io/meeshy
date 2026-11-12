package me.meeshy.app.calls

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.matchParentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color

/** La teinte du voile et des remplissages neutres : du noir sur une image, l'encre sombre de la planche sur du clair. */
internal fun CallGlassTone.veil(alpha: Float): Color = (if (isDarkFill) CallPalette.OnLightGlass else CallPalette.Veil).copy(alpha = alpha)

/** Le remplissage d'un bouton inactif : verre blanc sur une image, verre sombre sur un contenu clair. */
internal val CallGlassTone.neutralFill: Color
    get() = (if (isDarkFill) CallPalette.OnLightGlass else CallPalette.Ink).copy(alpha = neutralFillAlpha)

/** Le ton du verre de l'écran d'appel en cours, posé une fois par l'écran ; les boutons et blocs de verre le lisent. */
internal val LocalCallGlassTone = staticCompositionLocalOf { CallGlassTone.OverPicture }

/**
 * U2.6 — le voile du ton de l'écran (loi 3) sous le contenu d'un verre : plaque de nom, puce de l'écran, capsule de la
 * une. Premier enfant du verre ([CallGlassPlate]) ; il s'assombrit sur un écran partagé clair, comme l'en-tête.
 */
@Composable
internal fun BoxScope.CallToneScrim() {
    val tone = LocalCallGlassTone.current
    Box(Modifier.matchParentSize().background(tone.veil(tone.chipScrimAlpha)))
}
