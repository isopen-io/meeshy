package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerRowFitTest {
    private fun spacing(count: Int = 7, available: Float) =
        ComposerRowFit.spacing(count, 44f, 16f, 8f, 16f, available)

    @Test
    fun `seven tiles need 436 dp at nominal spacing`() {
        assertThat(ComposerRowFit.rowWidth(7, 44f, 16f, 16f)).isEqualTo(436f)
    }

    @Test
    fun `a row that fits keeps its nominal air`() {
        assertThat(spacing(available = 500f)).isEqualTo(16f)
        assertThat(spacing(available = 436f)).isEqualTo(16f)
    }

    @Test
    fun `an overflowing row tightens its gap just enough`() {
        assertThat(spacing(available = 402f)).isWithin(0.001f).of((402f - 7 * 44f - 32f) / 6f)
    }

    @Test
    fun `the gap never goes under its floor`() {
        assertThat(spacing(available = 320f)).isEqualTo(8f)
    }

    @Test
    fun `an unknown width answers the nominal gap, never an estimate`() {
        assertThat(spacing(available = 0f)).isEqualTo(16f)
        assertThat(spacing(available = -3f)).isEqualTo(16f)
    }

    @Test
    fun `a single entry has no gap to distribute and stays finite`() {
        assertThat(spacing(count = 1, available = 10f)).isEqualTo(16f)
        assertThat(spacing(count = 0, available = 10f)).isEqualTo(16f)
    }

    @Test
    fun `zero entries occupy nothing, margins included`() {
        assertThat(ComposerRowFit.rowWidth(0, 44f, 16f, 16f)).isEqualTo(0f)
    }

    @Test
    fun `the last entry peeks when its start is inside the field and not otherwise`() {
        assertThat(ComposerRowFit.lastTilePeeks(7, 44f, 8f, 16f, 402f)).isTrue()
        assertThat(ComposerRowFit.lastTilePeeks(7, 44f, 16f, 16f, 402f)).isTrue()
        assertThat(ComposerRowFit.lastTilePeeks(7, 44f, 16f, 16f, 376f)).isFalse()
        assertThat(ComposerRowFit.lastTilePeeks(0, 44f, 16f, 16f, 402f)).isFalse()
        assertThat(ComposerRowFit.lastTilePeeks(7, 44f, 16f, 16f, 0f)).isFalse()
    }

    @Test
    fun `at the floor on a narrow screen the last tile still peeks`() {
        val gap = spacing(available = 360f)
        assertThat(gap).isEqualTo(8f)
        assertThat(ComposerRowFit.lastTilePeeks(7, 44f, gap, 16f, 360f)).isTrue()
    }
}
