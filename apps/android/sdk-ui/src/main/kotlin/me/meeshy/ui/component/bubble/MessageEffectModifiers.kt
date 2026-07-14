package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.MessageEffectRenderPlanner
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.PersistentEffect
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Applies the **persistent** message-effect treatments (glow / pulse / rainbow) to a
 * bubble — the Compose consumer of the pure [MessageEffectRenderPlanner]. A port of the
 * continuous-treatment half of iOS `View.messageEffects(_:hasPlayedAppearance:)`
 * (`MessageEffectModifiers.swift`):
 *
 * - **Glow** — an indigo shadow whose radius and colour breathe (iOS `GlowEffect`, radius
 *   4↔12, opacity `intensity*0.3`↔`intensity`, resolved from the plan's [MessageEffectRenderPlanner]).
 * - **Pulse** — a subtle 1.0↔1.02 scale (iOS `PulseEffect`).
 * - **Rainbow** — a sweep-gradient border ring (iOS `RainbowEffect`).
 *
 * The one-shot appearance effects (shake / zoom / explode / waoo / confetti / fireworks)
 * and the sparkle canvas are a tracked follow-up; the plan already enumerates them so that
 * layer plugs in without touching the planner. All the "which effect renders" decisions
 * live in the pure planner (SDK purity); this modifier is thin, coverage-exempt glue.
 */
@Composable
public fun Modifier.messageEffects(
    effects: MessageEffects,
    hasPlayedAppearance: Boolean = false,
    shape: Shape = RoundedCornerShape(16.dp),
): Modifier {
    val plan = remember(effects, hasPlayedAppearance) {
        MessageEffectRenderPlanner.plan(effects, hasPlayedAppearance)
    }
    if (plan.persistent.isEmpty()) return this

    val transition = rememberInfiniteTransition(label = "message-effects")
    val pulseScale by transition.animateFloat(
        initialValue = 1f,
        targetValue = 1.02f,
        animationSpec = infiniteRepeatable(tween(1000), RepeatMode.Reverse),
        label = "pulse",
    )
    val intensity = plan.glowIntensity.toFloat()
    val glowAlpha by transition.animateFloat(
        initialValue = (intensity * 0.3f).coerceIn(0f, 1f),
        targetValue = intensity.coerceIn(0f, 1f),
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse),
        label = "glow-alpha",
    )
    val glowRadius by transition.animateFloat(
        initialValue = 4f,
        targetValue = 12f,
        animationSpec = infiniteRepeatable(tween(1500), RepeatMode.Reverse),
        label = "glow-radius",
    )

    var result = this
    if (PersistentEffect.GLOW in plan.persistent) {
        val glowColor = MeeshyPalette.Indigo500.copy(alpha = glowAlpha)
        result = result.shadow(
            elevation = glowRadius.dp,
            shape = shape,
            ambientColor = glowColor,
            spotColor = glowColor,
        )
    }
    if (PersistentEffect.PULSE in plan.persistent) {
        result = result.graphicsLayer {
            scaleX = pulseScale
            scaleY = pulseScale
        }
    }
    if (PersistentEffect.RAINBOW in plan.persistent) {
        result = result.border(width = 2.dp, brush = RainbowBorderBrush, shape = shape)
    }
    return result
}

/** Rainbow ring colours — parity with iOS `RainbowEffect`'s angular gradient. */
private val RainbowBorderBrush: Brush = Brush.sweepGradient(
    listOf(
        Color(0xFFEF4444), // red
        Color(0xFFF97316), // orange
        Color(0xFFEAB308), // yellow
        Color(0xFF22C55E), // green
        Color(0xFF3B82F6), // blue
        Color(0xFF8B5CF6), // purple
        Color(0xFFEF4444), // red (loop)
    ),
)
