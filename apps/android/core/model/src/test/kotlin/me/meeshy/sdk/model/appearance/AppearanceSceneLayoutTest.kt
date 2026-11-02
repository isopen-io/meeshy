package me.meeshy.sdk.model.appearance

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AppearanceSceneLayoutTest {

    private fun scene(anchor: AppearanceSceneAnchor) = AppearanceDesignScene(
        viewBox = listOf(0.0, 0.0, 100.0, 50.0),
        anchor = anchor,
        paths = listOf(AppearanceDesignStroke(d = "M0 0 L10 10", role = AppearancePaintRole.INK, opacity = 0.5, width = 1.0)),
    )

    @Test
    fun `scale fits the scene inside the box`() {
        assertThat(AppearanceSceneLayout.frame(scene(AppearanceSceneAnchor.CENTER), 200.0, 200.0, false).scale).isEqualTo(2.0)
    }

    @Test
    fun `bottom is centred horizontally on the floor`() {
        val frame = AppearanceSceneLayout.frame(scene(AppearanceSceneAnchor.BOTTOM), 300.0, 200.0, false)
        assertThat(frame.originX).isEqualTo(0.0)
        assertThat(frame.originY).isEqualTo(50.0)
    }

    @Test
    fun `center is centred on both axes`() {
        val frame = AppearanceSceneLayout.frame(scene(AppearanceSceneAnchor.CENTER), 200.0, 200.0, false)
        assertThat(frame.originX).isEqualTo(0.0)
        assertThat(frame.originY).isEqualTo(50.0)
    }

    @Test
    fun `bottom end hugs the end edge and mirrors in right to left`() {
        val ltr = AppearanceSceneLayout.frame(scene(AppearanceSceneAnchor.BOTTOM_END), 400.0, 100.0, false)
        val rtl = AppearanceSceneLayout.frame(scene(AppearanceSceneAnchor.BOTTOM_END), 400.0, 100.0, true)
        assertThat(ltr.originX).isEqualTo(200.0)
        assertThat(rtl.originX).isEqualTo(0.0)
        assertThat(ltr.originY).isEqualTo(0.0)
    }
}
