package me.meeshy.ui.component.bubble

import android.graphics.RenderEffect
import android.graphics.RuntimeShader
import android.os.Build
import androidx.annotation.RequiresApi
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterExitState
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.asComposeRenderEffect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.offset
import me.meeshy.sdk.model.EphemeralBurnLaw
import me.meeshy.sdk.model.EphemeralBurnSide
import me.meeshy.ui.accessibility.LocalReduceMotion

/** Les marges transparentes posées autour du calque qui brûle, pour que flammes et étincelles sortent de la bulle (iOS 24/48). */
private val OverhangSide = 24.dp
private val OverhangTop = 48.dp

/** La ligne se replie pendant les cendres : de 0,8 à 1 de la combustion. */
private val CollapseMillis: Int = (EphemeralBurnLaw.FULL_MILLIS * (1.0 - EphemeralBurnLaw.SPREAD_END)).toInt()

/**
 * #18556 — la bulle d'un éphémère qui meurt sous les yeux BRÛLE puis part (miroir de iOS `.ephemeralBurn(isBurning:side:)`,
 * #17938). [visible] faux déclenche la combustion ([EphemeralBurnLaw.durationMillis]) : le calque entier brûle (AGSL dès
 * l'API 33, lueur, rétrécissement et fondu dessous), la ligne se replie pendant les cendres, et rien n'en reste lisible.
 * « Réduire les animations » : un fondu de 250 ms, rien d'autre. Une bulle composée déjà échue ne brûle pas : on n'assiste
 * pas à une destruction passée. Le lecteur d'écran ne lit plus une bulle qui brûle.
 */
@Composable
public fun EphemeralBurnVisibility(
    visible: Boolean,
    isOutgoing: Boolean,
    seedKey: String,
    modifier: Modifier = Modifier,
    content: @Composable () -> Unit,
) {
    val reduceMotion = LocalReduceMotion.current
    val exit: ExitTransition = if (reduceMotion) {
        fadeOut(tween(EphemeralBurnLaw.FADE_MILLIS.toInt(), easing = LinearEasing))
    } else {
        shrinkVertically(tween(CollapseMillis, delayMillis = EphemeralBurnLaw.FULL_MILLIS.toInt() - CollapseMillis))
    }
    AnimatedVisibility(visible = visible, modifier = modifier, enter = EnterTransition.None, exit = exit) {
        if (reduceMotion) {
            content()
            return@AnimatedVisibility
        }
        val burn = transition.animateFloat(
            transitionSpec = { tween(EphemeralBurnLaw.FULL_MILLIS.toInt(), easing = LinearEasing) },
            label = "ephemeralBurn",
        ) { state -> if (state == EnterExitState.PostExit) 1f else 0f }
        val side = EphemeralBurnSide.of(isOutgoing)
        val burning = !visible
        val burnModifier = remember(burn, side, seedKey, burning) {
            if (!burning) Modifier else Modifier.ephemeralBurn(progress = { burn.value }, side = side, seed = (seedKey.hashCode() and 0xFFFF) / 65_535f)
        }
        Box(burnModifier.then(if (burning) Modifier.clearAndSetSemantics { } else Modifier), propagateMinConstraints = true) {
            content()
        }
    }
}

/**
 * Le calque qui brûle à [progress] (0 → 1, lu au dessin). Le vent souffle vers le bord extérieur de la bulle ([side],
 * loi `EphemeralBurnLaw.wind`), et le front part du bord d'où il vient.
 */
internal fun Modifier.ephemeralBurn(progress: () -> Float, side: EphemeralBurnSide, seed: Float): Modifier {
    val wind = EphemeralBurnLaw.wind(raw = null, side = side)
    val front = EphemeralBurnLaw.frontDirection(wind).toFloat()
    val agsl = if (Build.VERSION.SDK_INT >= 33) agslBurn(progress, front, wind.toFloat(), seed) else null
    return agsl ?: fallbackBurn(progress)
}

/** Le shader se compile UNE fois, quand la bulle s'allume ([EphemeralBurnVisibility] garde ce modificateur) ; chaque image ne pose que ses uniforms. */
@RequiresApi(33)
private fun Modifier.agslBurn(progress: () -> Float, front: Float, drift: Float, seed: Float): Modifier? {
    val shader = runCatching { RuntimeShader(EphemeralBurnShaderSources.BURN) }.getOrNull() ?: return null
    return this
        .layout { measurable, constraints ->
            val side = OverhangSide.roundToPx()
            val top = OverhangTop.roundToPx()
            val placeable = measurable.measure(constraints.offset(horizontal = 2 * side, vertical = top))
            layout(placeable.width - 2 * side, placeable.height - top) { placeable.place(-side, -top) }
        }
        .graphicsLayer {
            val p = progress()
            alpha = if (p >= 1f) 0f else 1f
            renderEffect = if (p <= 0f || p >= 1f) {
                null
            } else {
                shader.setFloatUniform("size", size.width, size.height)
                shader.setFloatUniform("progress", p)
                shader.setFloatUniform("frontDirection", front)
                shader.setFloatUniform("drift", drift)
                shader.setFloatUniform("seed", seed)
                shader.setFloatUniform("overhang", OverhangSide.value, OverhangTop.value)
                shader.setFloatUniform("density", density)
                RenderEffect.createRuntimeShaderEffect(shader, EphemeralBurnShaderSources.LAYER).asComposeRenderEffect()
            }
        }
        .padding(start = OverhangSide, end = OverhangSide, top = OverhangTop)
}

/** Sans AGSL : la bulle se dore, rétrécit et s'efface sur la même durée (le repli de la spec). */
private fun Modifier.fallbackBurn(progress: () -> Float): Modifier = this
    .graphicsLayer {
        val p = progress()
        alpha = 1f - p
        val scale = 1f - 0.2f * p
        scaleX = scale
        scaleY = scale
        compositingStrategy = CompositingStrategy.Offscreen
    }
    .drawWithContent {
        drawContent()
        val glow = progress().let { if (it < EphemeralBurnLaw.SPREAD_END) it / EphemeralBurnLaw.SPREAD_END.toFloat() else 1f }
        drawRect(Ember.copy(alpha = 0.6f * glow), blendMode = BlendMode.SrcAtop)
    }

private val Ember = Color(0xFFFF7A1A)
