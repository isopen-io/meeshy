package me.meeshy.app.feed

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** Le glyphe d'un engagement, animé comme celui d'iOS — voir [EngagementGlyph]. */
@Composable
internal fun EngagementIcon(
    icon: ImageVector,
    active: Boolean,
    tint: Color,
    modifier: Modifier = Modifier,
    size: Dp = 18.dp,
    burst: Boolean = false,
    tilt: Boolean = false,
) {
    EngagementGlyph(active = active, tint = tint, modifier = modifier, size = size, burst = burst, tilt = tilt) {
        Icon(imageVector = icon, contentDescription = null, tint = tint, modifier = Modifier.size(size))
    }
}

/**
 * L'emplacement d'un glyphe d'engagement : il saute (échelle + inclinaison, ressort rebondissant)
 * quand [active] passe à vrai, et, pour le cœur, un anneau s'élargit derrière. Tout passe par
 * `graphicsLayer` et des `Animatable` lus en phase de dessin : un saut ne recompose ni la carte
 * ni le fil.
 */
@Composable
internal fun EngagementGlyph(
    active: Boolean,
    tint: Color,
    modifier: Modifier = Modifier,
    size: Dp = 18.dp,
    burst: Boolean = false,
    tilt: Boolean = false,
    content: @Composable () -> Unit,
) {
    val scale = remember { Animatable(1f) }
    val rotation = remember { Animatable(0f) }
    val ring = remember { Animatable(0f) }
    var previous by remember { mutableStateOf<Boolean?>(null) }
    LaunchedEffect(active) {
        val pop = EngagementPop.shouldPop(previous, active)
        previous = active
        if (!pop) return@LaunchedEffect
        scale.snapTo(EngagementPop.PEAK_SCALE)
        if (tilt) rotation.snapTo(EngagementPop.HEART_TILT_DEGREES)
        if (burst) ring.snapTo(0f)
        val settle = spring<Float>(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium)
        coroutineScope {
            launch { scale.animateTo(1f, settle) }
            if (tilt) launch { rotation.animateTo(0f, settle) }
            if (burst) launch { ring.animateTo(1f, tween(EngagementPop.BURST_MILLIS, easing = FastOutSlowInEasing)) }
        }
    }
    Box(modifier = modifier.defaultMinSize(minWidth = size, minHeight = size), contentAlignment = Alignment.Center) {
        if (burst) {
            Canvas(Modifier.requiredSize(size * 2)) {
                val progress = ring.value
                if (progress > 0f && progress < 1f) {
                    drawCircle(
                        color = tint.copy(alpha = 0.6f * (1f - progress)),
                        radius = (size.toPx() / 2f) * (1f + progress),
                        style = Stroke(width = 2.dp.toPx() * (1f - progress)),
                    )
                }
            }
        }
        Box(
            Modifier.graphicsLayer {
                scaleX = scale.value
                scaleY = scale.value
                rotationZ = rotation.value
            },
        ) { content() }
    }
}

/**
 * Le compteur d'un engagement : le chiffre glisse vers le haut quand il croît, vers le bas
 * quand il décroît (iOS `contentTransition(.numericText())`). À zéro, rien n'est affiché.
 */
@Composable
internal fun EngagementCount(
    count: Int,
    color: Color,
    modifier: Modifier = Modifier,
) {
    if (count <= 0) return
    AnimatedContent(
        targetState = count,
        modifier = modifier,
        transitionSpec = {
            val rising = targetState > initialState
            (slideInVertically { height -> if (rising) height else -height } + fadeIn(tween(160)))
                .togetherWith(slideOutVertically { height -> if (rising) -height else height } + fadeOut(tween(120)))
                .using(SizeTransform(clip = false))
        },
        label = "engagement-count",
    ) { shown ->
        Text(
            text = shown.toString(),
            style = MaterialTheme.typography.labelMedium,
            color = color,
        )
    }
}
