package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import androidx.compose.runtime.rememberCoroutineScope
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.haptics.rememberMeeshyHaptics

private const val COMET_SCALE = 2.6f
private const val COMET_DROP_DP = 18f
private const val COMET_IMPACT_DELAY_MILLIS = 180L
private const val COMET_SHAKE_MILLIS = 420
private const val COMET_SHAKE_DEGREES = 9f
private const val COMET_SHAKE_DP = 3f

/**
 * L'entrée « comète » d'une pastille neuve (iOS `CometPillModifier`) : zoom 2,6x et chute de 18 dp
 * ramenés par un ressort rebondissant, puis un tremblement amorti (rotation 9 deg, 3 dp). Une
 * pastille qui n'est pas neuve ([isNew] faux) est rendue à son état final sans aucun mouvement :
 * le recyclage d'une cellule ne rejoue rien. Sous « Réduire les animations » l'intention reste
 * (haptique léger) mais le mouvement part.
 */
@Composable
internal fun Modifier.reactionComet(isNew: Boolean): Modifier {
    val reduce = LocalReduceMotion.current
    val haptics = rememberMeeshyHaptics()
    val scope = rememberCoroutineScope()
    val progress = remember { Animatable(if (isNew && !reduce) 0f else 1f) }
    val shake = remember { Animatable(0f) }
    val wobble = remember { Animatable(0f) }
    val started = remember { booleanArrayOf(false) }
    LaunchedEffect(isNew) {
        if (!isNew || started[0]) return@LaunchedEffect
        started[0] = true
        haptics.light()
        if (reduce) return@LaunchedEffect
        scope.launch { progress.animateTo(1f, spring(dampingRatio = 0.55f, stiffness = Spring.StiffnessMedium)) }
        delay(COMET_IMPACT_DELAY_MILLIS)
        shake.snapTo(1f)
        wobble.snapTo(0f)
        scope.launch { wobble.animateTo(1f, tween(COMET_SHAKE_MILLIS, easing = androidx.compose.animation.core.LinearEasing)) }
        shake.animateTo(0f, tween(COMET_SHAKE_MILLIS, easing = FastOutSlowInEasing))
    }
    return graphicsLayer {
        val p = progress.value
        val scale = COMET_SCALE - (COMET_SCALE - 1f) * p
        scaleX = scale
        scaleY = scale
        rotationZ = sin(wobble.value * PI.toFloat() * 6f) * shake.value * COMET_SHAKE_DEGREES
        translationX = cos(wobble.value * PI.toFloat() * 6f) * shake.value * COMET_SHAKE_DP * density
        translationY = -COMET_DROP_DP * (1f - p) * density
    }
}
