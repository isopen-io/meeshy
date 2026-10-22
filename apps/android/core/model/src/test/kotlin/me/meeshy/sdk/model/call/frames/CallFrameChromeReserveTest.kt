package me.meeshy.sdk.model.call.frames

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallFrameChromeReserveTest {

    private val layout = CallFrameLayout(CallFrameArrangement.GRID, margin = 0.06, gap = 0.03, top = 0.18, bottom = 0.12)

    @Test
    fun `une bande ne depasse jamais la moitie de la toile`() {
        val reserve = CallFrameChromeReserve(top = 0.9, bottom = 2.0)
        assertThat(reserve.top).isEqualTo(0.5)
        assertThat(reserve.bottom).isEqualTo(0.5)
    }

    @Test
    fun `une bande s arrondit au millieme superieur`() {
        assertThat(CallFrameChromeReserve(top = 0.1231, bottom = 0.2).top).isEqualTo(0.124)
        assertThat(CallFrameChromeReserve(top = 0.1231, bottom = 0.2).bottom).isEqualTo(0.2)
    }

    @Test
    fun `une valeur negative, nulle ou non finie ne donne aucune bande`() {
        assertThat(CallFrameChromeReserve(-1.0, 0.0)).isEqualTo(CallFrameChromeReserve.NONE)
        assertThat(CallFrameChromeReserve(Double.NaN, Double.POSITIVE_INFINITY)).isEqualTo(CallFrameChromeReserve.NONE)
    }

    @Test
    fun `covering rapporte des points a la hauteur de la vue`() {
        val reserve = CallFrameChromeReserve.covering(top = 100.0, bottom = 200.0, height = 1000.0)
        assertThat(reserve.top).isEqualTo(0.1)
        assertThat(reserve.bottom).isEqualTo(0.2)
        assertThat(CallFrameChromeReserve.covering(top = 10.0, bottom = 10.0, height = 0.0)).isEqualTo(CallFrameChromeReserve.NONE)
    }

    @Test
    fun `les bandes se posent en haut et en bas de la toile`() {
        val (top, bottom) = CallFrameChromeReserve(0.1, 0.2).bands(width = 1080.0, height = 1920.0)
        assertThat(top).isEqualTo(CallFrameRect(0.0, 0.0, 1080.0, 192.0))
        assertThat(bottom.maxY).isEqualTo(1920.0)
        assertThat(bottom.height).isEqualTo(384.0)
    }

    @Test
    fun `sans reserve la geometrie est canonique`() {
        val canonical = CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0)
        assertThat(CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0, CallFrameChromeReserve.NONE)).isEqualTo(canonical)
    }

    @Test
    fun `les reserves de texte descendent sous la bande haute et remontent au dessus de la basse`() {
        val reserve = CallFrameChromeReserve(top = 0.25, bottom = 0.2)
        val areas = CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0, reserve)
        val (bandTop, bandBottom) = reserve.bands(1080.0, 1920.0)

        assertThat(areas.top.maxY).isAtLeast(bandTop.maxY - 1e-9)
        assertThat(areas.bottom.minY).isAtMost(bandBottom.minY + 1e-9)
        assertThat(areas.content.minY).isEqualTo(areas.top.maxY)
        assertThat(areas.content.maxY).isWithin(1e-9).of(areas.bottom.minY)
    }

    @Test
    fun `un controle geant ne reduit jamais les visages sous la moitie de leur zone`() {
        val canonical = CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0)
        val areas = CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0, CallFrameChromeReserve(0.5, 0.5))

        assertThat(areas.content.height).isAtLeast(canonical.content.height * 0.5 - 1e-9)
    }

    @Test
    fun `les cases tiennent entre les bandes de commandes`() {
        val reserve = CallFrameChromeReserve(top = 0.2, bottom = 0.15)
        val slots = CallFrameLayoutGeometry.slots(
            layout, CallFrameSlotStyle(CallFrameSlotShape.ROUND, null, null, false, null, false, null, CallFrameTilt.NONE, CallFrameTone.COLOR, null),
            people = 4, width = 1080.0, height = 1920.0, reserve = reserve,
        )
        val areas = CallFrameLayoutGeometry.areas(layout, 1080.0, 1920.0, reserve)

        slots.forEach {
            assertThat(it.rect.minY).isAtLeast(areas.content.minY - 1e-6)
            assertThat(it.rect.maxY).isAtMost(areas.content.maxY + 1e-6)
        }
    }
}
