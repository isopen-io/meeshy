package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryFilter
import org.junit.Test

/**
 * Behavioural spec for the pure photo-filter colour math — the single source of
 * truth for how each preset looks and how the strength slider blends it toward the
 * neutral identity. No Android, no Compose: exactly the rendering decision we must
 * get right before the canvas glue.
 */
class StoryFilterMatrixTest {

    private val allFilters = StoryFilter.entries

    @Test
    fun `identity matrix has twenty components`() {
        assertThat(StoryColorMatrix.IDENTITY.values).hasSize(20)
    }

    @Test
    fun `a colour matrix must have exactly twenty components`() {
        runCatching { StoryColorMatrix(List(19) { 0f }) }.also {
            assertThat(it.isFailure).isTrue()
        }
    }

    @Test
    fun `blend at zero returns this matrix`() {
        val a = StoryColorMatrix.IDENTITY
        val b = StoryFilterMatrix.baseMatrix(StoryFilter.BW)
        assertThat(a.blend(b, 0f)).isEqualTo(a)
    }

    @Test
    fun `blend at one returns the other matrix`() {
        val a = StoryColorMatrix.IDENTITY
        val b = StoryFilterMatrix.baseMatrix(StoryFilter.BW)
        assertThat(a.blend(b, 1f)).isEqualTo(b)
    }

    @Test
    fun `blend at half is the per-component midpoint`() {
        val a = StoryColorMatrix.IDENTITY
        val b = StoryFilterMatrix.baseMatrix(StoryFilter.VIVID)
        val mid = a.blend(b, 0.5f)
        a.values.indices.forEach { i ->
            assertThat(mid.values[i]).isWithin(1e-4f).of((a.values[i] + b.values[i]) / 2f)
        }
    }

    @Test
    fun `blend clamps a negative factor to zero`() {
        val a = StoryColorMatrix.IDENTITY
        val b = StoryFilterMatrix.baseMatrix(StoryFilter.WARM)
        assertThat(a.blend(b, -3f)).isEqualTo(a)
    }

    @Test
    fun `blend clamps an over-one factor to one`() {
        val a = StoryColorMatrix.IDENTITY
        val b = StoryFilterMatrix.baseMatrix(StoryFilter.WARM)
        assertThat(a.blend(b, 4f)).isEqualTo(b)
    }

    @Test
    fun `no filter resolves to the identity matrix at any strength`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(null, 0f)).isEqualTo(StoryColorMatrix.IDENTITY)
        assertThat(StoryFilterMatrix.effectiveMatrix(null, 1f)).isEqualTo(StoryColorMatrix.IDENTITY)
    }

    @Test
    fun `zero strength resolves to identity even with a filter set`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.DRAMATIC, 0f))
            .isEqualTo(StoryColorMatrix.IDENTITY)
    }

    @Test
    fun `full strength resolves to the base matrix`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.DRAMATIC, 1f))
            .isEqualTo(StoryFilterMatrix.baseMatrix(StoryFilter.DRAMATIC))
    }

    @Test
    fun `half strength is the midpoint of identity and the base matrix`() {
        val base = StoryFilterMatrix.baseMatrix(StoryFilter.FADE)
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.FADE, 0.5f))
            .isEqualTo(StoryColorMatrix.IDENTITY.blend(base, 0.5f))
    }

    @Test
    fun `a negative strength clamps to identity`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.COOL, -2f))
            .isEqualTo(StoryColorMatrix.IDENTITY)
    }

    @Test
    fun `an over-one strength clamps to the base matrix`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.COOL, 5f))
            .isEqualTo(StoryFilterMatrix.baseMatrix(StoryFilter.COOL))
    }

    @Test
    fun `a non-finite strength collapses to full effect`() {
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.VINTAGE, Float.NaN))
            .isEqualTo(StoryFilterMatrix.baseMatrix(StoryFilter.VINTAGE))
        assertThat(StoryFilterMatrix.effectiveMatrix(StoryFilter.VINTAGE, Float.POSITIVE_INFINITY))
            .isEqualTo(StoryFilterMatrix.baseMatrix(StoryFilter.VINTAGE))
    }

    @Test
    fun `clampIntensity folds into the unit range`() {
        assertThat(StoryFilterMatrix.clampIntensity(0.4f)).isEqualTo(0.4f)
        assertThat(StoryFilterMatrix.clampIntensity(-1f)).isEqualTo(0f)
        assertThat(StoryFilterMatrix.clampIntensity(9f)).isEqualTo(1f)
    }

    @Test
    fun `clampIntensity maps a non-finite value to the default`() {
        assertThat(StoryFilterMatrix.clampIntensity(Float.NaN)).isEqualTo(StoryFilterMatrix.DEFAULT_INTENSITY)
        assertThat(StoryFilterMatrix.clampIntensity(Float.NEGATIVE_INFINITY))
            .isEqualTo(StoryFilterMatrix.DEFAULT_INTENSITY)
    }

    @Test
    fun `every preset differs from identity at full strength`() {
        allFilters.forEach { filter ->
            assertThat(StoryFilterMatrix.baseMatrix(filter)).isNotEqualTo(StoryColorMatrix.IDENTITY)
        }
    }

    @Test
    fun `the eight presets are all distinct`() {
        val matrices = allFilters.map { StoryFilterMatrix.baseMatrix(it) }.toSet()
        assertThat(matrices).hasSize(8)
    }

    @Test
    fun `black and white maps the three colour rows to the same luminance weights`() {
        val bw = StoryFilterMatrix.baseMatrix(StoryFilter.BW).values
        val rRow = bw.subList(0, 3)
        val gRow = bw.subList(5, 8)
        val bRow = bw.subList(10, 13)
        assertThat(gRow).isEqualTo(rRow)
        assertThat(bRow).isEqualTo(rRow)
    }

    @Test
    fun `wireValue maps each preset to its gateway token`() {
        assertThat(StoryFilter.VINTAGE.wireValue()).isEqualTo("vintage")
        assertThat(StoryFilter.BW.wireValue()).isEqualTo("bw")
        assertThat(StoryFilter.WARM.wireValue()).isEqualTo("warm")
        assertThat(StoryFilter.COOL.wireValue()).isEqualTo("cool")
        assertThat(StoryFilter.DRAMATIC.wireValue()).isEqualTo("dramatic")
        assertThat(StoryFilter.VIVID.wireValue()).isEqualTo("vivid")
        assertThat(StoryFilter.FADE.wireValue()).isEqualTo("fade")
        assertThat(StoryFilter.CHROME.wireValue()).isEqualTo("chrome")
    }

    @Test
    fun `every preset has a distinct wire token`() {
        assertThat(allFilters.map { it.wireValue() }.toSet()).hasSize(8)
    }
}
