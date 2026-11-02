package me.meeshy.ui.motion

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.InfiniteRepeatableSpec
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.accessibility.MotionSpecs
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.theme.MeeshyMotion

private val EaseInOut = CubicBezierEasing(0.42f, 0f, 0.58f, 1f)

private fun springOf(response: Float, damping: Float): AnimationSpec<Float> =
    spring(dampingRatio = damping, stiffness = MeeshyMotion.stiffnessForResponse(response))

/** Ressort iOS `(response, dampingFraction)`, remplace par `snap()` sous reduction. */
internal fun motionSpec(reduce: Boolean, response: Float, damping: Float): AnimationSpec<Float> =
    if (reduce) snap<Float>() else springOf(response, damping)

/** Observe l'appui SANS le consommer ni voler le geste au defilement (iOS `simultaneousGesture`). */
private fun Modifier.trackPress(onPressed: (Boolean) -> Unit): Modifier = pointerInput(Unit) {
    awaitEachGesture {
        awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
        onPressed(true)
        do {
            val event = awaitPointerEvent(PointerEventPass.Initial)
        } while (event.changes.any { it.pressed })
        onPressed(false)
    }
}

private fun Modifier.pressScale(target: Float, response: Float, damping: Float): Modifier = composed {
    val reduce = LocalReduceMotion.current
    var pressed by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = MotionSpecs.pressScale(pressed, target, reduce),
        animationSpec = motionSpec(reduce, response, damping),
        label = "pressScale",
    )
    trackPress { pressed = it }.graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/** iOS `pressable()` : 0,93 a l'appui, ressort (0,2 ; 0,6). */
public fun Modifier.pressable(): Modifier =
    pressScale(MotionSpecs.PRESSABLE_SCALE, response = 0.2f, damping = 0.6f)

/** iOS `bounceOnTap(scale:)` : 0,92 par defaut, ressort (0,3 ; 0,6). */
public fun Modifier.bounceOnTap(scale: Float = MotionSpecs.BOUNCE_ON_TAP_SCALE): Modifier =
    pressScale(scale, response = 0.3f, damping = 0.6f)

/** iOS `bounceOnFocus(_:)` : 1,02 quand le champ a le focus (aucune echelle sous reduction). */
public fun Modifier.bounceOnFocus(focused: Boolean): Modifier = composed {
    val reduce = LocalReduceMotion.current
    val scale by animateFloatAsState(
        targetValue = if (focused && !reduce) MotionSpecs.BOUNCE_ON_FOCUS_SCALE else 1f,
        animationSpec = motionSpec(reduce, 0.3f, 0.6f),
        label = "bounceOnFocus",
    )
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

@Composable
private fun rememberVisibleAfter(delayMillis: Int): Boolean {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(delayMillis.toLong())
        visible = true
    }
    return visible
}

/** iOS `bounceOnAppear(delay:)` : 0,5 -> 1 avec fondu, ressort (0,4 ; 0,6) ; etat final immediat sous reduction. */
public fun Modifier.bounceOnAppear(delayMillis: Int = 0): Modifier = composed {
    val reduce = LocalReduceMotion.current
    val visible = rememberVisibleAfter(delayMillis)
    val target = MotionSpecs.bounceOnAppear(visible, reduce)
    val spec = motionSpec(reduce, 0.4f, 0.6f)
    val scale by animateFloatAsState(target.scale, spec, label = "bounceOnAppearScale")
    val alpha by animateFloatAsState(target.alpha, spec, label = "bounceOnAppearAlpha")
    graphicsLayer {
        scaleX = scale
        scaleY = scale
        this.alpha = alpha
    }
}

/** iOS `staggeredAppear(index:baseDelay:)` : 50 ms par rang, 20 dp, 0,95, ressort (0,45 ; 0,8). */
public fun Modifier.staggeredAppear(
    index: Int,
    baseDelayMillis: Int = MotionSpecs.STAGGER_STEP_MILLIS,
): Modifier = composed {
    val reduce = LocalReduceMotion.current
    val visible = rememberVisibleAfter(if (reduce) 0 else index.coerceAtLeast(0) * baseDelayMillis)
    val target = MotionSpecs.staggeredAppear(index, visible, reduce, baseDelayMillis)
    val spec = motionSpec(reduce, 0.45f, 0.8f)
    val alpha by animateFloatAsState(target.alpha, spec, label = "staggerAlpha")
    val offset by animateFloatAsState(target.offsetDp, spec, label = "staggerOffset")
    val scale by animateFloatAsState(target.scale, spec, label = "staggerScale")
    graphicsLayer {
        this.alpha = alpha
        translationY = offset * density
        scaleX = scale
        scaleY = scale
    }
}

private fun loop(durationMillis: Int): InfiniteRepeatableSpec<Float> =
    infiniteRepeatable(tween(durationMillis, easing = EaseInOut), RepeatMode.Reverse)

/** iOS `floating(range:duration:)` : derive elliptique 15 dp / 4 s ; immobile sous reduction. */
public fun Modifier.floating(
    rangeDp: Float = MotionSpecs.FLOATING_RANGE_DP,
    durationMillis: Int = MotionSpecs.FLOATING_PERIOD_MILLIS,
): Modifier = composed {
    if (!MotionSpecs.floatingActive(LocalReduceMotion.current)) return@composed this
    val phase by rememberInfiniteTransition(label = "floating")
        .animateFloat(0f, 1f, loop(durationMillis), label = "floatingPhase")
    graphicsLayer {
        val from = MotionSpecs.floatingOffsetDp(floating = false, range = rangeDp)
        val to = MotionSpecs.floatingOffsetDp(floating = true, range = rangeDp)
        translationX = (from.first + (to.first - from.first) * phase) * density
        translationY = (from.second + (to.second - from.second) * phase) * density
    }
}

/** iOS `pulse(intensity:)` : 1 -> 1,04 en 1,8 s, aller-retour ; immobile sous reduction. */
public fun Modifier.pulse(intensity: Float = MotionSpecs.PULSE_INTENSITY): Modifier = composed {
    if (!MotionSpecs.pulseActive(LocalReduceMotion.current)) return@composed this
    val phase by rememberInfiniteTransition(label = "pulse")
        .animateFloat(0f, 1f, loop(MotionSpecs.PULSE_PERIOD_MILLIS), label = "pulsePhase")
    graphicsLayer {
        val scale = 1f + (MotionSpecs.pulseScale(pulsing = true, intensity = intensity) - 1f) * phase
        scaleX = scale
        scaleY = scale
    }
}
