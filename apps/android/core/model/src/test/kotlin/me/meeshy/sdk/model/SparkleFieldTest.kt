package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of the persistent sparkle field — the pure time-driven twinkle geometry
 * beneath the sparkle bubble treatment (ports iOS `SparkleEffect`, `MessageEffectModifiers.swift`).
 * Asserts the fixed twinkle count, the exact reference sample, the inner-bounds / size / alpha
 * envelopes, the shared-twinkle invariant that couples a spark's size and opacity, time evolution
 * and the degenerate clamp; never asserts a literal the test itself set.
 */
class SparkleFieldTest {

    @Test
    fun fieldHasEightSparkles() {
        assertThat(SparkleFields.field(time = 0.0, width = 100f, height = 100f))
            .hasSize(SparkleFields.SPARKLE_COUNT)
    }

    @Test
    fun referenceSparkleAtOriginTimeHasCleanValues() {
        // index 0 at time 0: phase 0 → x = (sin 0)·0.4+0.5 = 0.5w, y = (cos 0)·0.4+0.5 = 0.9h,
        // twinkle = sin 0 = 0 → size = 5, alpha = 0.4.
        val s = SparkleFields.sparkleAt(index = 0, time = 0.0, width = 100f, height = 100f)
        assertThat(s.x).isWithin(1e-3f).of(50f)
        assertThat(s.y).isWithin(1e-3f).of(90f)
        assertThat(s.size).isWithin(1e-3f).of(5f)
        assertThat(s.alpha).isWithin(1e-3f).of(0.4f)
    }

    @Test
    fun everySparklePositionStaysWithinTheInnerTenToNinetyBand() {
        val w = 240f
        val h = 160f
        for (index in 0 until SparkleFields.SPARKLE_COUNT) {
            for (step in 0..40) {
                val s = SparkleFields.sparkleAt(index, time = step * 0.37, width = w, height = h)
                assertThat(s.x).isAtLeast(0.1f * w - 1e-2f)
                assertThat(s.x).isAtMost(0.9f * w + 1e-2f)
                assertThat(s.y).isAtLeast(0.1f * h - 1e-2f)
                assertThat(s.y).isAtMost(0.9f * h + 1e-2f)
            }
        }
    }

    @Test
    fun everySparkleSizeStaysWithinTheMinToMaxBand() {
        for (index in 0 until SparkleFields.SPARKLE_COUNT) {
            for (step in 0..40) {
                val s = SparkleFields.sparkleAt(index, time = step * 0.41, width = 100f, height = 100f)
                assertThat(s.size).isAtLeast(SparkleFields.MIN_SIZE - 1e-3f)
                assertThat(s.size).isAtMost(SparkleFields.MIN_SIZE + SparkleFields.SIZE_RANGE + 1e-3f)
            }
        }
    }

    @Test
    fun everySparkleAlphaStaysWithinTheTwinkleBand() {
        for (index in 0 until SparkleFields.SPARKLE_COUNT) {
            for (step in 0..40) {
                val s = SparkleFields.sparkleAt(index, time = step * 0.29, width = 100f, height = 100f)
                assertThat(s.alpha).isAtLeast(0.1f - 1e-3f)
                assertThat(s.alpha).isAtMost(0.7f + 1e-3f)
            }
        }
    }

    @Test
    fun sizeAndAlphaShareTheSameTwinkleDrive() {
        // Both derive from twinkle = sin(phase·2 + i): (size-MIN)/RANGE == (alpha-0.1)/0.6.
        for (index in 0 until SparkleFields.SPARKLE_COUNT) {
            for (step in 0..20) {
                val s = SparkleFields.sparkleAt(index, time = step * 0.53, width = 100f, height = 100f)
                val sizeNorm = (s.size - SparkleFields.MIN_SIZE) / SparkleFields.SIZE_RANGE
                val alphaNorm = (s.alpha - 0.1f) / 0.6f
                assertThat(sizeNorm).isWithin(1e-3f).of(alphaNorm)
            }
        }
    }

    @Test
    fun twinkleEvolvesOverTime() {
        val at0 = SparkleFields.sparkleAt(index = 0, time = 0.0, width = 100f, height = 100f)
        // time 0.5 → phase 0.5 → twinkle = sin(1.0) ≈ 0.841 → size ≈ 7.52, distinctly larger than 5.
        val later = SparkleFields.sparkleAt(index = 0, time = 0.5, width = 100f, height = 100f)
        assertThat(later.size).isGreaterThan(at0.size + 1f)
        assertThat(later.alpha).isGreaterThan(at0.alpha + 0.1f)
    }

    @Test
    fun negativeDimensionsClampPositionToZero() {
        val s = SparkleFields.sparkleAt(index = 3, time = 1.7, width = -80f, height = -60f)
        assertThat(s.x).isEqualTo(0f)
        assertThat(s.y).isEqualTo(0f)
    }

    @Test
    fun sameInputsAreDeterministic() {
        val a = SparkleFields.sparkleAt(index = 5, time = 2.3, width = 130f, height = 90f)
        val b = SparkleFields.sparkleAt(index = 5, time = 2.3, width = 130f, height = 90f)
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun fieldDelegatesToSparkleAtForEachIndex() {
        val field = SparkleFields.field(time = 3.14, width = 120f, height = 80f)
        field.forEachIndexed { index, sparkle ->
            assertThat(sparkle).isEqualTo(
                SparkleFields.sparkleAt(index, time = 3.14, width = 120f, height = 80f),
            )
        }
    }
}
