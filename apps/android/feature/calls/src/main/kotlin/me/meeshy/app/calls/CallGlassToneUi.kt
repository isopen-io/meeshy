package me.meeshy.app.calls

import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

private val OnLightInk = Color(0xFF12161E)

/** La teinte du voile et des remplissages neutres : du noir sur une image, l'encre sombre de la planche sur du clair. */
internal fun CallGlassTone.veil(alpha: Float): Color = (if (isDarkFill) OnLightInk else Color.Black).copy(alpha = alpha)

/** Le remplissage d'un bouton inactif : verre blanc sur une image, verre sombre sur un contenu clair. */
internal val CallGlassTone.neutralFill: Color
    get() = (if (isDarkFill) OnLightInk else Color.White).copy(alpha = neutralFillAlpha)

/** Le ton du verre de l'écran d'appel en cours, posé une fois par l'écran ; les boutons et blocs de verre le lisent. */
internal val LocalCallGlassTone = staticCompositionLocalOf { CallGlassTone.OverPicture }
