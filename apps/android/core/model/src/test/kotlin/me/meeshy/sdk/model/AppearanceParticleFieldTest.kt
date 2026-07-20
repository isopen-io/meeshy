package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlin.math.hypot
import org.junit.Test

/**
 * Behavioural coverage of the one-shot appearance particle fields — the pure geometry beneath
 * the confetti / fireworks bubble overlays (ports iOS `ConfettiOverlay`/`FireworksOverlay`,
 * made deterministic/seeded). Asserts the spawn envelope, the radial burst layout, the
 * animation interpolation and every degenerate case; never asserts a literal the test itself set.
 */
class AppearanceParticleFieldTest {

    // MARK: - Particle interpolation

    @Test
    fun particleAtProgressZeroIsTheStart() {
        val p = Particle(startX = 2f, startY = 3f, endX = 10f, endY = 20f, colorIndex = 0, size = 4f, rotationDegrees = 0f)
        assertThat(p.xAt(0f)).isWithin(1e-4f).of(2f)
        assertThat(p.yAt(0f)).isWithin(1e-4f).of(3f)
    }

    @Test
    fun particleAtProgressOneIsTheEnd() {
        val p = Particle(startX = 2f, startY = 3f, endX = 10f, endY = 20f, colorIndex = 0, size = 4f, rotationDegrees = 0f)
        assertThat(p.xAt(1f)).isWithin(1e-4f).of(10f)
        assertThat(p.yAt(1f)).isWithin(1e-4f).of(20f)
    }

    @Test
    fun particleAtHalfProgressIsTheMidpoint() {
        val p = Particle(startX = 0f, startY = 0f, endX = 8f, endY = 40f, colorIndex = 0, size = 4f, rotationDegrees = 0f)
        assertThat(p.xAt(0.5f)).isWithin(1e-4f).of(4f)
        assertThat(p.yAt(0.5f)).isWithin(1e-4f).of(20f)
    }

    @Test
    fun particleProgressIsClampedOutsideTheUnitInterval() {
        val p = Particle(startX = 1f, startY = 1f, endX = 9f, endY = 9f, colorIndex = 0, size = 4f, rotationDegrees = 0f)
        // below 0 clamps to the start, above 1 clamps to the end
        assertThat(p.xAt(-2f)).isWithin(1e-4f).of(1f)
        assertThat(p.yAt(-2f)).isWithin(1e-4f).of(1f)
        assertThat(p.xAt(5f)).isWithin(1e-4f).of(9f)
        assertThat(p.yAt(5f)).isWithin(1e-4f).of(9f)
    }

    // MARK: - Confetti

    @Test
    fun confettiNonPositiveCountYieldsAnEmptyField() {
        assertThat(ConfettiFieldGenerator.generate(count = 0, width = 200f, height = 100f, seed = 1).isEmpty).isTrue()
        assertThat(ConfettiFieldGenerator.generate(count = -5, width = 200f, height = 100f, seed = 1).isEmpty).isTrue()
    }

    @Test
    fun confettiDefaultCountSpawnsThirtyParticles() {
        val field = ConfettiFieldGenerator.generate(width = 200f, height = 100f, seed = 1)
        assertThat(field.particles).hasSize(ConfettiFieldGenerator.DEFAULT_COUNT)
        assertThat(field.paletteSize).isEqualTo(ConfettiFieldGenerator.PALETTE_SIZE)
    }

    @Test
    fun confettiSingleParticleFieldHasExactlyOne() {
        assertThat(ConfettiFieldGenerator.generate(count = 1, width = 200f, height = 100f, seed = 1).particles).hasSize(1)
    }

    @Test
    fun confettiAllParticlesRainFromAboveTheTopToBelowTheBottom() {
        val height = 120f
        val field = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = height, seed = 7)
        // Every particle starts above the top edge (negative y) and ends below the bottom.
        assertThat(field.particles.all { it.startY < 0f }).isTrue()
        assertThat(field.particles.all { it.endY > height }).isTrue()
        // The whole burst lands on the same floor line (deterministic exit).
        assertThat(field.particles.map { it.endY }.toSet()).hasSize(1)
    }

    @Test
    fun confettiStartsWithinWidthAndDriftsHorizontallyWithinBound() {
        val width = 200f
        val field = ConfettiFieldGenerator.generate(count = 30, width = width, height = 100f, seed = 3)
        field.particles.forEach { p ->
            assertThat(p.startX).isAtLeast(0f)
            assertThat(p.startX).isAtMost(width)
            // horizontal drift is bounded to ±30 (iOS `random(in: -30...30)`)
            assertThat(kotlin.math.abs(p.endX - p.startX)).isAtMost(30f)
        }
    }

    @Test
    fun confettiColorIndexAndSizeStayWithinBounds() {
        val field = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = 100f, seed = 9)
        field.particles.forEach { p ->
            assertThat(p.colorIndex).isAtLeast(0)
            assertThat(p.colorIndex).isLessThan(ConfettiFieldGenerator.PALETTE_SIZE)
            assertThat(p.size).isAtLeast(4f)
            assertThat(p.size).isAtMost(8f)
        }
    }

    @Test
    fun confettiZeroWidthPinsEveryStartToTheLeftEdge() {
        val field = ConfettiFieldGenerator.generate(count = 10, width = 0f, height = 100f, seed = 2)
        assertThat(field.particles.all { it.startX == 0f }).isTrue()
    }

    @Test
    fun confettiNegativeDimensionsAreClampedToZero() {
        val field = ConfettiFieldGenerator.generate(count = 5, width = -50f, height = -80f, seed = 2)
        assertThat(field.particles.all { it.startX == 0f }).isTrue()
        // height clamps to 0 -> exit line is the fall margin (20) below the top
        assertThat(field.particles.all { it.endY == 20f }).isTrue()
    }

    @Test
    fun confettiIsDeterministicForTheSameSeed() {
        val a = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = 100f, seed = 42)
        val b = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = 100f, seed = 42)
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun confettiDiffersBetweenSeeds() {
        val a = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = 100f, seed = 1)
        val b = ConfettiFieldGenerator.generate(count = 30, width = 200f, height = 100f, seed = 2)
        assertThat(a).isNotEqualTo(b)
    }

    // MARK: - Fireworks

    @Test
    fun fireworksNonPositiveCountYieldsAnEmptyField() {
        assertThat(FireworksFieldGenerator.generate(count = 0, width = 200f, height = 100f, seed = 1).isEmpty).isTrue()
        assertThat(FireworksFieldGenerator.generate(count = -3, width = 200f, height = 100f, seed = 1).isEmpty).isTrue()
    }

    @Test
    fun fireworksDefaultCountSpawnsTwentySparks() {
        val field = FireworksFieldGenerator.generate(width = 200f, height = 100f, seed = 1)
        assertThat(field.particles).hasSize(FireworksFieldGenerator.DEFAULT_COUNT)
        assertThat(field.paletteSize).isEqualTo(FireworksFieldGenerator.PALETTE_SIZE)
    }

    @Test
    fun fireworksAllSparksStartAtTheExactCentre() {
        val width = 200f
        val height = 100f
        val field = FireworksFieldGenerator.generate(count = 12, width = width, height = height, seed = 5)
        assertThat(field.particles.all { it.startX == width / 2f && it.startY == height / 2f }).isTrue()
    }

    @Test
    fun fireworksAnglesAreEvenlySpacedByCount() {
        val count = 8
        val field = FireworksFieldGenerator.generate(count = count, width = 200f, height = 200f, seed = 5)
        field.particles.forEachIndexed { i, p ->
            assertThat(p.rotationDegrees).isWithin(1e-3f).of(i * (360f / count))
        }
    }

    @Test
    fun fireworksBurstFliesEastSouthWestNorthForFourSparks() {
        val cx = 100f
        val cy = 100f
        val field = FireworksFieldGenerator.generate(count = 4, width = 200f, height = 200f, seed = 5)
        val (east, south, west, north) = field.particles
        // angle 0° -> +x (east), y unchanged
        assertThat(east.endX).isGreaterThan(cx)
        assertThat(east.endY).isWithin(1e-2f).of(cy)
        // 90° -> +y (south in screen coords), x unchanged
        assertThat(south.endY).isGreaterThan(cy)
        assertThat(south.endX).isWithin(1e-2f).of(cx)
        // 180° -> -x (west)
        assertThat(west.endX).isLessThan(cx)
        assertThat(west.endY).isWithin(1e-2f).of(cy)
        // 270° -> -y (north)
        assertThat(north.endY).isLessThan(cy)
        assertThat(north.endX).isWithin(1e-2f).of(cx)
    }

    @Test
    fun fireworksSparkDistanceStaysWithinTheBurstRadius() {
        val cx = 100f
        val cy = 100f
        val field = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 11)
        field.particles.forEach { p ->
            val distance = hypot(p.endX - cx, p.endY - cy)
            assertThat(distance).isAtLeast(40f)
            assertThat(distance).isAtMost(80f)
        }
    }

    @Test
    fun fireworksSparkSizeIsUniform() {
        val field = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 11)
        assertThat(field.particles.all { it.size == FireworksFieldGenerator.SPARK_SIZE }).isTrue()
    }

    @Test
    fun fireworksZeroSizeBoxBurstsFromTheOrigin() {
        val field = FireworksFieldGenerator.generate(count = 6, width = 0f, height = 0f, seed = 4)
        assertThat(field.particles.all { it.startX == 0f && it.startY == 0f }).isTrue()
    }

    @Test
    fun fireworksIsDeterministicForTheSameSeed() {
        val a = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 42)
        val b = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 42)
        assertThat(a).isEqualTo(b)
    }

    @Test
    fun fireworksDiffersBetweenSeeds() {
        val a = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 1)
        val b = FireworksFieldGenerator.generate(count = 20, width = 200f, height = 200f, seed = 2)
        assertThat(a).isNotEqualTo(b)
    }

    // MARK: - Effect -> field resolution

    @Test
    fun confettiEffectResolvesToAConfettiField() {
        val field = AppearanceParticleFields.forEffect(AppearanceEffect.CONFETTI, width = 200f, height = 100f, seed = 1)
        assertThat(field).isNotNull()
        assertThat(field!!.paletteSize).isEqualTo(ConfettiFieldGenerator.PALETTE_SIZE)
        assertThat(field.particles).hasSize(ConfettiFieldGenerator.DEFAULT_COUNT)
    }

    @Test
    fun fireworksEffectResolvesToAFireworksField() {
        val field = AppearanceParticleFields.forEffect(AppearanceEffect.FIREWORKS, width = 200f, height = 100f, seed = 1)
        assertThat(field).isNotNull()
        assertThat(field!!.paletteSize).isEqualTo(FireworksFieldGenerator.PALETTE_SIZE)
        assertThat(field.particles).hasSize(FireworksFieldGenerator.DEFAULT_COUNT)
    }

    @Test
    fun particleEffectsSetIsExactlyConfettiAndFireworks() {
        assertThat(AppearanceParticleFields.particleEffects)
            .containsExactly(AppearanceEffect.CONFETTI, AppearanceEffect.FIREWORKS)
    }

    @Test
    fun transformOnlyEffectsCarryNoParticleField() {
        listOf(
            AppearanceEffect.SHAKE,
            AppearanceEffect.ZOOM,
            AppearanceEffect.EXPLODE,
            AppearanceEffect.WAOO,
        ).forEach { effect ->
            assertThat(AppearanceParticleFields.forEffect(effect, width = 200f, height = 100f, seed = 1)).isNull()
        }
    }
}
