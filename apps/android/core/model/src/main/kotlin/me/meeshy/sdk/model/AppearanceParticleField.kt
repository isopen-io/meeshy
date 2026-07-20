package me.meeshy.sdk.model

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin
import kotlin.random.Random

/**
 * A single one-shot appearance particle. The particle travels from ([startX], [startY])
 * to ([endX], [endY]) as an animation progress runs `0f → 1f`; [colorIndex] selects a
 * hue from the owning field's palette, [size] is its edge in px, and [rotationDegrees] its
 * static tilt. Pure and Android-free — the Compose overlay that paints it is app/UI glue.
 */
data class Particle(
    val startX: Float,
    val startY: Float,
    val endX: Float,
    val endY: Float,
    val colorIndex: Int,
    val size: Float,
    val rotationDegrees: Float,
) {
    /** The x position at animation [progress] (clamped to `0f..1f`); `0f`→start, `1f`→end. */
    fun xAt(progress: Float): Float =
        startX + (endX - startX) * progress.coerceIn(0f, 1f)

    /** The y position at animation [progress] (clamped to `0f..1f`); `0f`→start, `1f`→end. */
    fun yAt(progress: Float): Float =
        startY + (endY - startY) * progress.coerceIn(0f, 1f)
}

/**
 * An immutable field of [particles] for a one-shot appearance overlay (confetti / fireworks).
 * [paletteSize] is the number of hues a renderer cycles through — each particle's
 * [Particle.colorIndex] is guaranteed to fall in `0 until paletteSize`.
 */
data class ParticleField(
    val particles: List<Particle>,
    val paletteSize: Int,
) {
    /** True when the field holds no particles (nothing to draw). */
    val isEmpty: Boolean get() = particles.isEmpty()
}

/**
 * Deterministic confetti field — a port of iOS `ConfettiOverlay.spawnConfetti`
 * (`MessageEffectModifiers.swift`): [DEFAULT_COUNT] rectangles rain from just above the top
 * edge (`y = SPAWN_Y`) down past the bottom (`y = height + FALL_MARGIN`) with a small
 * horizontal drift, in one of [PALETTE_SIZE] colours.
 *
 * **Surpasses iOS** by being *seeded*: iOS re-rolls `CGFloat.random` on every `onAppear`, so
 * the same message's confetti jumps around between appearances (scroll off → on). Seeding on
 * a stable per-message value makes the burst reproducible across recompositions and, crucially,
 * unit-testable. Degenerate inputs are pinned: a non-positive [count] yields an empty field and
 * negative dimensions are clamped to zero.
 */
object ConfettiFieldGenerator {
    const val DEFAULT_COUNT: Int = 30

    /** red · blue · green · yellow · purple · orange · pink (iOS confetti palette). */
    const val PALETTE_SIZE: Int = 7

    private const val SPAWN_Y: Float = -10f
    private const val FALL_MARGIN: Float = 20f
    private const val DRIFT: Float = 30f
    private const val MIN_SIZE: Float = 4f
    private const val MAX_SIZE: Float = 8f

    fun generate(
        count: Int = DEFAULT_COUNT,
        width: Float,
        height: Float,
        seed: Long,
    ): ParticleField {
        if (count <= 0) return ParticleField(emptyList(), PALETTE_SIZE)
        val w = width.coerceAtLeast(0f)
        val h = height.coerceAtLeast(0f)
        val rng = Random(seed)
        val particles = (0 until count).map {
            val startX = rng.nextFloat() * w
            val drift = (rng.nextFloat() * 2f - 1f) * DRIFT
            val colorIndex = rng.nextInt(PALETTE_SIZE)
            val size = MIN_SIZE + rng.nextFloat() * (MAX_SIZE - MIN_SIZE)
            val rotation = rng.nextFloat() * 360f
            Particle(
                startX = startX,
                startY = SPAWN_Y,
                endX = startX + drift,
                endY = h + FALL_MARGIN,
                colorIndex = colorIndex,
                size = size,
                rotationDegrees = rotation,
            )
        }
        return ParticleField(particles, PALETTE_SIZE)
    }
}

/**
 * Deterministic fireworks field — a port of iOS `FireworksOverlay.spawnFireworks`
 * (`MessageEffectModifiers.swift`): [DEFAULT_COUNT] sparks burst radially from the centre,
 * evenly spaced by angle (`angleᵢ = i · 360 / count`), each flying out a seeded distance in
 * `MIN_DISTANCE..MAX_DISTANCE`, in one of [PALETTE_SIZE] colours.
 *
 * Screen coordinates (y grows downward): angle 0° flies east, 90° south, 180° west, 270° north.
 * The angular layout is fully determined by [count] (only the per-spark distance and colour are
 * seeded), so a small ring reads as an even star. Same seeding/reproducibility win as
 * [ConfettiFieldGenerator]; a non-positive [count] yields an empty field and negative
 * dimensions clamp to zero (a zero-size box bursts from the origin).
 */
object FireworksFieldGenerator {
    const val DEFAULT_COUNT: Int = 20

    /** indigo500 · indigo400 · yellow · orange · white (iOS fireworks palette). */
    const val PALETTE_SIZE: Int = 5

    /** Every spark is a small round dot (iOS draws a 4×4 circle). */
    const val SPARK_SIZE: Float = 4f

    private const val MIN_DISTANCE: Float = 40f
    private const val MAX_DISTANCE: Float = 80f

    fun generate(
        count: Int = DEFAULT_COUNT,
        width: Float,
        height: Float,
        seed: Long,
    ): ParticleField {
        if (count <= 0) return ParticleField(emptyList(), PALETTE_SIZE)
        val centerX = width.coerceAtLeast(0f) / 2f
        val centerY = height.coerceAtLeast(0f) / 2f
        val rng = Random(seed)
        val particles = (0 until count).map { i ->
            val angleDeg = i.toDouble() * (360.0 / count)
            val rad = angleDeg * PI / 180.0
            val distance = MIN_DISTANCE + rng.nextFloat() * (MAX_DISTANCE - MIN_DISTANCE)
            val colorIndex = rng.nextInt(PALETTE_SIZE)
            Particle(
                startX = centerX,
                startY = centerY,
                endX = centerX + (cos(rad) * distance).toFloat(),
                endY = centerY + (sin(rad) * distance).toFloat(),
                colorIndex = colorIndex,
                size = SPARK_SIZE,
                rotationDegrees = angleDeg.toFloat(),
            )
        }
        return ParticleField(particles, PALETTE_SIZE)
    }
}

/**
 * Resolves the [ParticleField] a one-shot [AppearanceEffect] renders as an overlay, or `null`
 * for the transform-only effects (shake / zoom / explode / waoo animate the bubble itself and
 * carry no particles). The single place that maps an appearance effect → its particle field, so
 * the render layer never re-decides which effects spawn particles.
 */
object AppearanceParticleFields {
    /**
     * The appearance effects that render as a particle overlay (confetti / fireworks), as
     * opposed to the transform-only effects that animate the bubble itself. Derived from
     * [forEffect] so the two can never disagree — a renderer uses this to decide whether a
     * bubble needs a particle canvas at all before its size is known.
     */
    val particleEffects: Set<AppearanceEffect> by lazy {
        AppearanceEffect.entries.filterTo(LinkedHashSet()) {
            forEffect(it, width = 1f, height = 1f, seed = 0L) != null
        }
    }

    fun forEffect(
        effect: AppearanceEffect,
        width: Float,
        height: Float,
        seed: Long,
    ): ParticleField? = when (effect) {
        AppearanceEffect.CONFETTI ->
            ConfettiFieldGenerator.generate(width = width, height = height, seed = seed)
        AppearanceEffect.FIREWORKS ->
            FireworksFieldGenerator.generate(width = width, height = height, seed = seed)
        AppearanceEffect.SHAKE,
        AppearanceEffect.ZOOM,
        AppearanceEffect.EXPLODE,
        AppearanceEffect.WAOO,
        -> null
    }
}
