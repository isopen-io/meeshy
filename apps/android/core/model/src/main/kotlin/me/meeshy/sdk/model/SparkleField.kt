package me.meeshy.sdk.model

import kotlin.math.cos
import kotlin.math.sin

/**
 * A single twinkling spark of the persistent sparkle treatment at one instant. It sits at
 * ([x], [y]) px inside the bubble, is a [size]-px-diameter white dot drawn at [alpha] opacity.
 * Pure and Android-free — the Compose `Canvas` overlay that paints it is coverage-exempt UI glue.
 * This is the persistent counterpart to [Particle] (the one-shot confetti / fireworks geometry).
 */
data class Sparkle(
    val x: Float,
    val y: Float,
    val size: Float,
    val alpha: Float,
)

/**
 * Deterministic persistent sparkle geometry — a port of iOS `SparkleEffect`
 * (`MessageEffectModifiers.swift`): [SPARKLE_COUNT] white dots twinkle continuously over the
 * bubble, each driven purely by the wall-clock `time` (seconds) so the treatment never has to
 * store state. Every spark `i` combines three phase-shifted sinusoids of a shared `phase =
 * time + i · PHASE_STEP`:
 *
 * - **position** — `x = (sin(phase·1.3 + i)·SPREAD + 0.5)·width`, `y = (cos(phase·0.9 + i·0.7)·
 *   SPREAD + 0.5)·height`. With [SPREAD] `= 0.4` the sine term lands in `-0.4..0.4`, so a spark
 *   always drifts inside the central `0.1..0.9` band of the bubble and never clips the edge.
 * - **size + alpha** — both read the *same* twinkle `sin(phase·2 + i)`: `size` maps its `-1..1`
 *   to `[MIN_SIZE, MIN_SIZE + SIZE_RANGE]` and `alpha` to `0.1..0.7`, so a spark grows and
 *   brightens together (iOS `sparkleSize` / `sparkleOpacity` share the identical expression).
 *
 * **Surpasses iOS** by lifting the whole twinkle out of the untestable in-`Canvas` closure into a
 * pure JVM-covered function; degenerate inputs are pinned — negative dimensions clamp to zero so a
 * zero-size bubble twinkles from the origin rather than off-screen.
 */
object SparkleFields {
    /** Number of concurrent twinkling sparks (iOS `0..<8`). */
    const val SPARKLE_COUNT: Int = 8

    /** Per-spark time offset in seconds — spreads the eight sparks across the twinkle cycle. */
    const val PHASE_STEP: Double = 0.5

    /** Half-width of the position band around the bubble centre (iOS `· 0.4 + 0.5`). */
    const val SPREAD: Float = 0.4f

    /** Smallest spark diameter in px (iOS `… + 2`). */
    const val MIN_SIZE: Float = 2f

    /** Span of the spark diameter above [MIN_SIZE] in px (iOS `… · 6 …`), so max = 8. */
    const val SIZE_RANGE: Float = 6f

    private const val X_FREQ: Double = 1.3
    private const val Y_FREQ: Double = 0.9
    private const val Y_INDEX_PHASE: Double = 0.7
    private const val TWINKLE_FREQ: Double = 2.0
    private const val ALPHA_CENTER: Float = 0.4f
    private const val ALPHA_AMPLITUDE: Float = 0.3f

    /** The [Sparkle] for spark [index] at [time] seconds inside a [width]×[height]-px bubble. */
    fun sparkleAt(index: Int, time: Double, width: Float, height: Float): Sparkle {
        val w = width.coerceAtLeast(0f)
        val h = height.coerceAtLeast(0f)
        val phase = time + index * PHASE_STEP
        val fx = (sin(phase * X_FREQ + index).toFloat() * SPREAD + 0.5f)
        val fy = (cos(phase * Y_FREQ + index * Y_INDEX_PHASE).toFloat() * SPREAD + 0.5f)
        val twinkle = sin(phase * TWINKLE_FREQ + index).toFloat()
        return Sparkle(
            x = fx * w,
            y = fy * h,
            size = (twinkle * 0.5f + 0.5f) * SIZE_RANGE + MIN_SIZE,
            alpha = twinkle * ALPHA_AMPLITUDE + ALPHA_CENTER,
        )
    }

    /** The full ring of [SPARKLE_COUNT] sparks at [time] — one [sparkleAt] per index (SSOT). */
    fun field(time: Double, width: Float, height: Float): List<Sparkle> =
        (0 until SPARKLE_COUNT).map { sparkleAt(it, time, width, height) }
}
