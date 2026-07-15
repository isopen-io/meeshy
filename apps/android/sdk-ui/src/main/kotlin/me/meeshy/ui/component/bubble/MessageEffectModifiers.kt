package me.meeshy.ui.component.bubble

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.AppearanceEffect
import me.meeshy.sdk.model.AppearanceParticleFields
import me.meeshy.sdk.model.AppearanceTransforms
import me.meeshy.sdk.model.MessageEffectRenderPlan
import me.meeshy.sdk.model.MessageEffectRenderPlanner
import me.meeshy.sdk.model.MessageEffects
import me.meeshy.sdk.model.PersistentEffect
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Applies the message-effect treatments to a bubble — the Compose consumer of the pure
 * [MessageEffectRenderPlanner]. Two layers, each a port of iOS
 * `View.messageEffects(_:hasPlayedAppearance:)` (`MessageEffectModifiers.swift`):
 *
 * - **Persistent** (glow / pulse / rainbow) — continuous treatments that render every frame.
 * - **One-shot appearance transforms** (shake / zoom / explode / waoo) — a transform that pops the
 *   bubble itself (offset / scale / fade / glow) once on appear, gated off once `hasPlayedAppearance`
 *   is set.
 * - **One-shot appearance particles** (confetti / fireworks) — a burst that plays once when the
 *   bubble appears and is gated off once `hasPlayedAppearance` is set (the plan drops appearance
 *   effects once played).
 *
 * All the "which effect renders / what it looks like at progress p" decisions live in the pure
 * model ([AppearanceTransforms], [AppearanceParticleFields]) for SDK purity; this modifier is thin,
 * coverage-exempt glue that only drives a `0f → 1f` progress and applies the resolved values in the
 * layer / draw phase (no per-frame recomposition).
 */
@Composable
public fun Modifier.messageEffects(
    effects: MessageEffects,
    hasPlayedAppearance: Boolean = false,
    shape: Shape = RoundedCornerShape(16.dp),
    appearanceSeed: Long = 0L,
): Modifier {
    val plan = remember(effects, hasPlayedAppearance) {
        MessageEffectRenderPlanner.plan(effects, hasPlayedAppearance)
    }
    return this
        .appearanceTransforms(plan, appearanceSeed)
        .persistentEffects(plan, shape)
        .appearanceParticles(plan, appearanceSeed)
}

/**
 * The one-shot shake / zoom / explode / waoo transform (iOS `ShakeEffect`/`ZoomEffect`/
 * `ExplodeEffect`/`WaooEffect`). The per-progress geometry is the pure [AppearanceTransforms];
 * this only animates a `0f → 1f` progress and applies the resolved offset / scale / fade in the
 * layer phase (via `graphicsLayer`) and the waoo glow in the draw phase (via `drawBehind`) so the
 * bubble subtree never recomposes per frame.
 */
@Composable
private fun Modifier.appearanceTransforms(
    plan: MessageEffectRenderPlan,
    seed: Long,
): Modifier {
    val transformEffects = remember(plan) {
        plan.appearance.filterTo(LinkedHashSet()) { it in AppearanceTransforms.transformEffects }
    }
    if (transformEffects.isEmpty()) return this

    val progress = remember { Animatable(0f) }
    LaunchedEffect(seed, transformEffects) {
        progress.snapTo(0f)
        progress.animateTo(
            targetValue = 1f,
            animationSpec = tween(durationMillis = TRANSFORM_DURATION_MS, easing = LinearOutSlowInEasing),
        )
    }

    return this
        .drawBehind {
            val spec = AppearanceTransforms.resolve(transformEffects, progress.value)
            if (spec.glowAlpha <= 0f) return@drawBehind
            val radius = size.maxDimension / 2f + GLOW_SPREAD_PX
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(WaooGlowColor.copy(alpha = spec.glowAlpha), Color.Transparent),
                    center = center,
                    radius = radius,
                ),
                radius = radius,
                center = center,
            )
        }
        .graphicsLayer {
            val spec = AppearanceTransforms.resolve(transformEffects, progress.value)
            translationX = spec.translationX
            scaleX = spec.scale
            scaleY = spec.scale
            alpha = spec.alpha
        }
}

/** The continuous glow / pulse / rainbow treatments (iOS `GlowEffect`/`PulseEffect`/`RainbowEffect`). */
@Composable
private fun Modifier.persistentEffects(plan: MessageEffectRenderPlan, shape: Shape): Modifier {
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

/**
 * The one-shot confetti / fireworks particle burst (iOS `ConfettiOverlay`/`FireworksOverlay`).
 * The particle geometry is the pure [AppearanceParticleFields]; this only animates a `0f → 1f`
 * progress and paints the field over the bubble content, fading it out at the tail.
 */
@Composable
private fun Modifier.appearanceParticles(plan: MessageEffectRenderPlan, seed: Long): Modifier {
    val particleEffects = remember(plan) {
        plan.appearance.filter { it in AppearanceParticleFields.particleEffects }
    }
    if (particleEffects.isEmpty()) return this

    val progress = remember { Animatable(0f) }
    LaunchedEffect(seed, particleEffects) {
        progress.snapTo(0f)
        progress.animateTo(1f, tween(durationMillis = 1500, easing = LinearOutSlowInEasing))
    }

    return this.drawWithContent {
        drawContent()
        val p = progress.value
        // Fade the whole burst out over the last fifth of its travel.
        val fade = if (p > 0.8f) (1f - (p - 0.8f) / 0.2f).coerceIn(0f, 1f) else 1f
        if (fade <= 0f) return@drawWithContent
        particleEffects.forEach { effect ->
            val field = AppearanceParticleFields.forEffect(
                effect = effect,
                width = size.width,
                height = size.height,
                seed = seed + effect.ordinal,
            ) ?: return@forEach
            val palette = paletteFor(effect)
            field.particles.forEach { particle ->
                val color = palette[particle.colorIndex % palette.size].copy(alpha = fade)
                val x = particle.xAt(p)
                val y = particle.yAt(p)
                when (effect) {
                    AppearanceEffect.CONFETTI -> {
                        val w = particle.size
                        val h = particle.size * 0.6f
                        rotate(degrees = particle.rotationDegrees, pivot = Offset(x, y)) {
                            drawRoundRect(
                                color = color,
                                topLeft = Offset(x - w / 2f, y - h / 2f),
                                size = Size(w, h),
                                cornerRadius = CornerRadius(1f, 1f),
                            )
                        }
                    }
                    else -> drawCircle(color = color, radius = particle.size / 2f, center = Offset(x, y))
                }
            }
        }
    }
}

/** One-shot appearance-transform run length in ms — covers the longest effect (waoo ≈ 0.7s). */
private const val TRANSFORM_DURATION_MS: Int = 700

/** How far the waoo glow halo spreads past the bubble edge, in px. */
private const val GLOW_SPREAD_PX: Float = 24f

/** The waoo glow hue — parity with iOS `WaooEffect`'s `.yellow` shadow. */
private val WaooGlowColor: Color = Color(0xFFEAB308)

/** Confetti hues — parity with iOS `ConfettiOverlay`'s `[.red, .blue, .green, .yellow, .purple, .orange, .pink]`. */
private val ConfettiPalette: List<Color> = listOf(
    Color(0xFFEF4444), // red
    Color(0xFF3B82F6), // blue
    Color(0xFF22C55E), // green
    Color(0xFFEAB308), // yellow
    Color(0xFF8B5CF6), // purple
    Color(0xFFF97316), // orange
    Color(0xFFEC4899), // pink
)

/** Fireworks hues — parity with iOS `FireworksOverlay` (indigo-leaning, accent-coherent). */
private val FireworksPalette: List<Color> = listOf(
    MeeshyPalette.Indigo500,
    MeeshyPalette.Indigo400,
    Color(0xFFEAB308), // yellow
    Color(0xFFF97316), // orange
    MeeshyPalette.White,
)

private fun paletteFor(effect: AppearanceEffect): List<Color> = when (effect) {
    AppearanceEffect.FIREWORKS -> FireworksPalette
    else -> ConfettiPalette
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
