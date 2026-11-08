package me.meeshy.ui.component.game

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.SemanticsPropertyKey
import androidx.compose.ui.semantics.SemanticsPropertyReceiver
import androidx.compose.ui.semantics.semantics
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.ui.accessibility.LocalReduceMotion

/**
 * Le dessin de la Flamme, pur et testé (miroir de `FlameView.swift`, #9380) : la hauteur de chaque forme, la
 * Signature blanche au cœur dès la Flamme, les halos d'or de l'Astre et du Soleil, et la loi du vacillement.
 */
internal object FlamePlan {
    const val BOX: Float = 72f
    const val FLICKER_MILLIS: Int = 1600
    const val FLICKER_SCALE_X: Float = 0.04f
    const val FLICKER_SCALE_Y: Float = 0.08f
    const val FLICKER_ORIGIN_Y: Float = 0.9f
    const val OUT_OPACITY: Float = 0.45f
    val foot: Offset = Offset(36f, 70f)
    const val BODY_D: String =
        "M36 10 c 12 16 22 26 18 42 a18 18 0 0 1 -36 0 c -2 -12 8 -18 10 -28 c 4 6 6 10 8 12 c 2 -8 2 -16 0 -26 z"

    /** La hauteur de la flamme, de 0 à 1 : réduite autour du pied, elle reste entière et grandit avec la série. */
    fun scale(form: FlameFormKey): Float = when (form) {
        FlameFormKey.Braise -> 0.45f
        FlameFormKey.Flamme -> 0.7f
        FlameFormKey.Brasier -> 0.95f
        FlameFormKey.Astre, FlameFormKey.Soleil -> 1f
    }

    /** La Braise (1 à 6 jours) n'a pas encore de Signature. */
    fun showsSignature(form: FlameFormKey): Boolean = form != FlameFormKey.Braise

    /** Le rayon du halo d'or en pointillé : Astre 25, Soleil 31 ; aucun avant. */
    fun haloRadius(form: FlameFormKey): Float? = when (form) {
        FlameFormKey.Astre -> 25f
        FlameFormKey.Soleil -> 31f
        else -> null
    }

    /** Vacille tant que la flamme brûle, est visible et que le mouvement est permis ; sinon elle s'arrête net. */
    fun flickers(flickers: Boolean, lit: Boolean, reduceMotion: Boolean, onScreen: Boolean): Boolean =
        flickers && lit && !reduceMotion && onScreen

    fun opacity(lit: Boolean): Float = if (lit) 1f else OUT_OPACITY
}

internal val FlameFlickeringKey = SemanticsPropertyKey<Boolean>("FlameFlickering")
internal var SemanticsPropertyReceiver.flameFlickering by FlameFlickeringKey

private val desaturated: ColorFilter = ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) })

/**
 * La Flamme : cinq formes selon la série ([form], issue de `GameFlameLaw.form`). Elle vacille 1,6 s (aller-retour)
 * tant qu'elle est visible, et s'arrête hors écran ou sous « Réduire les animations ». [lit] faux : éteinte,
 * désaturée à 0,45 d'opacité, sans vacillement. [flickers] faux : flamme fixe (miniature de liste).
 * [accessibilityLabel] nul : décorative ; l'hôte dit « Flamme de 12 jours ».
 */
@Composable
public fun FlameView(
    form: FlameFormKey,
    modifier: Modifier = Modifier,
    lit: Boolean = true,
    flickers: Boolean = true,
    accessibilityLabel: String? = null,
) {
    val reduceMotion = LocalReduceMotion.current
    var onScreen by remember { mutableStateOf(true) }
    val animates = FlamePlan.flickers(flickers, lit, reduceMotion, onScreen)
    var phase by remember { mutableFloatStateOf(0f) }
    LaunchedEffect(animates) {
        if (!animates) {
            phase = 0f
            return@LaunchedEffect
        }
        animate(
            initialValue = 0f,
            targetValue = 1f,
            animationSpec = infiniteRepeatable(tween(FlamePlan.FLICKER_MILLIS, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        ) { value, _ -> phase = value }
    }
    val body = remember { cachedGamePath(FlamePlan.BODY_D) }
    Canvas(
        modifier
            .aspectRatio(1f)
            .alpha(FlamePlan.opacity(lit))
            .gameOnScreen { onScreen = it }
            .graphicsLayer {
                scaleX = 1f + FlamePlan.FLICKER_SCALE_X * phase
                scaleY = 1f + FlamePlan.FLICKER_SCALE_Y * phase
                transformOrigin = TransformOrigin(0.5f, FlamePlan.FLICKER_ORIGIN_Y)
            }
            .semantics { flameFlickering = animates }
            .gameAccessibility(accessibilityLabel),
    ) {
        val k = size.width / FlamePlan.BOX
        val filter = if (lit) null else desaturated
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            drawHalo(form, filter)
            drawFlameBody(form, body, filter)
        }
    }
}

private fun DrawScope.drawHalo(form: FlameFormKey, filter: ColorFilter?) {
    val radius = FlamePlan.haloRadius(form) ?: return
    drawCircle(
        color = GamePalette.gold,
        radius = radius,
        center = Offset(36f, 40f),
        style = Stroke(width = 1.5f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(3f, 4f))),
        colorFilter = filter,
    )
}

private fun DrawScope.drawFlameBody(form: FlameFormKey, body: androidx.compose.ui.graphics.Path, filter: ColorFilter?) {
    val s = FlamePlan.scale(form)
    withTransform({ scale(s, s, pivot = FlamePlan.foot) }) {
        drawPath(body, GameMaterial.FLAME.brush(body.getBounds()), colorFilter = filter)
        if (FlamePlan.showsSignature(form)) {
            drawGameSignature(Offset(36f, 54f), 18f, Color.White, SignatureStyle.Flat, 120f)
        }
    }
}
