package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective.CellGeometry
import org.junit.Test

class FocalReducedMotionTest {

    private val cells = listOf(
        CellGeometry("a", visualMidY = 100.0, height = 60.0, isMessage = true),
        CellGeometry("b", visualMidY = 300.0, height = 60.0, isMessage = true),
    )

    private fun frame(reduceMotion: Boolean) = FocalFrame(
        nowMs = 0.0, scrolledDp = 0.0, cells = cells, focusY = 300.0,
        rowWidth = 360.0, reduceMotion = reduceMotion, isFirstInGroup = { false },
    )

    @Test
    fun `reduire les animations pose l'identite sur chaque cellule`() {
        FocalScrollPerspectiveHost.poses(frame(reduceMotion = true)).values.forEach {
            assertThat(it.scale).isEqualTo(1.0)
            assertThat(it.alpha).isEqualTo(1.0)
        }
    }

    @Test
    fun `sans reduction la cellule lointaine est bien reduite`() {
        assertThat(FocalScrollPerspectiveHost.poses(frame(reduceMotion = false)).getValue("a").scale).isLessThan(1.0)
    }

    @Test
    fun `reduire les animations ne grossit pas l'elu`() {
        val scene = FocalSceneState()
        scene.tick(frame(true))
        scene.tick(frame(true).copy(nowMs = 4_000.0, scrolledDp = 400.0))
        assertThat(scene.detailedId).isEqualTo("b")
        assertThat(scene.contentScale).isEqualTo(1f)
    }
}
