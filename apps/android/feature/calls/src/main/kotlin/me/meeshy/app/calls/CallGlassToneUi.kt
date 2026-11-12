package me.meeshy.app.calls

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.drawOutline
import androidx.compose.ui.graphics.lerp
import me.meeshy.sdk.model.call.CallChromeStow

/** La teinte du voile et des remplissages neutres : du noir sur une image, l'encre sombre de la planche sur du clair. */
internal fun CallGlassTone.veil(alpha: Float): Color = (if (isDarkFill) CallPalette.OnLightGlass else CallPalette.Veil).copy(alpha = alpha)

/** Le remplissage d'un bouton inactif : verre blanc sur une image, verre sombre sur un contenu clair. */
internal val CallGlassTone.neutralFill: Color
    get() = (if (isDarkFill) CallPalette.OnLightGlass else CallPalette.Ink).copy(alpha = neutralFillAlpha)

/** Le ton du verre de l'écran d'appel en cours, posé une fois par l'écran ; les boutons et blocs de verre le lisent. */
internal val LocalCallGlassTone = staticCompositionLocalOf { CallGlassTone.OverPicture }

/** Où en est le fondu du verre : 0 = le ton de l'image, 1 = le ton sombre d'un écran reçu. */
internal val CallGlassTone.fadeTarget: Float
    get() = if (isDarkFill) 1f else 0f

/**
 * L5.8 — le voile à mi-chemin des deux tons : les extrémités rendent EXACTEMENT les valeurs de chaque ton, entre les
 * deux c'est un mélange (iOS `CallGlassVeil` fond l'opacité). [alphaOf] choisit l'opacité du voile : bloc, puce ou plaque.
 */
internal fun callToneVeilAt(progress: Float, alphaOf: (CallGlassTone) -> Float): Color {
    val picture = CallGlassTone.OverPicture.veil(alphaOf(CallGlassTone.OverPicture))
    val light = CallGlassTone.OverLightContent.veil(alphaOf(CallGlassTone.OverLightContent))
    return when {
        progress <= 0f -> picture
        progress >= 1f -> light
        else -> lerp(picture, light, progress)
    }
}

private val RestingFade = object : State<Float> { override val value: Float = 0f }

/** Le fondu du ton, posé une fois par l'écran ; un State, lu au DESSIN seulement : l'écran ne se recompose pas par image. */
internal val LocalCallGlassToneProgress = staticCompositionLocalOf<State<Float>> { RestingFade }

/** Le fondu d'un verre dont le voile reste au ton de l'image (les boutons posés dans un bloc déjà voilé). */
internal val CallRestingToneFade: State<Float> get() = RestingFade

/** L5.8 — le ton passe de l'un à l'autre en fondu court (celui du rangement des contrôles), jamais d'un saut. */
@Composable
internal fun rememberCallGlassToneProgress(tone: CallGlassTone, reduceMotion: Boolean): State<Float> =
    animateFloatAsState(tone.fadeTarget, tween(CallChromeStow.fadeMillis(reduceMotion)), label = "callGlassTone")

/**
 * Le voile du ton de l'écran sous un verre, lu au dessin : le fondu ne recompose rien. À poser AVANT que le verre ne
 * rende le ton clair à ses boutons ([CallGlassTone.withinVeiledBlock]).
 */
@Composable
internal fun Modifier.callToneVeil(alphaOf: (CallGlassTone) -> Float, shape: Shape = RectangleShape): Modifier {
    val progress = LocalCallGlassToneProgress.current
    return drawWithCache {
        val outline = shape.createOutline(size, layoutDirection, this)
        onDrawBehind { drawOutline(outline, callToneVeilAt(progress.value, alphaOf)) }
    }
}

/**
 * U2.6 — le voile du ton de l'écran (loi 3) sous le contenu d'un verre : plaque de nom, puce de l'écran, capsule de la
 * une. Premier enfant du verre ([CallGlassPlate]) ; il s'assombrit sur un écran partagé clair, comme l'en-tête.
 */
@Composable
internal fun BoxScope.CallToneScrim() {
    Box(Modifier.matchParentSize().callToneVeil(CallGlassTone::chipScrimAlpha))
}
