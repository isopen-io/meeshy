package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective.CellGeometry
import org.junit.Test

class FocalSceneStateTest {

    private val cells = listOf(
        CellGeometry(id = "a", visualMidY = 200.0, height = 60.0, isMessage = true),
        CellGeometry(id = "day", visualMidY = 300.0, height = 30.0, isMessage = false),
        CellGeometry(id = "b", visualMidY = 380.0, height = 60.0, isMessage = true),
        CellGeometry(id = "c", visualMidY = 520.0, height = 60.0, isMessage = true),
    )

    private fun frame(nowMs: Double, scrolledDp: Double, focusY: Double = 390.0, reduceMotion: Boolean = false) = FocalFrame(
        nowMs = nowMs,
        scrolledDp = scrolledDp,
        cells = cells,
        focusY = focusY,
        rowWidth = 360.0,
        reduceMotion = reduceMotion,
        isFirstInGroup = { it == "b" },
    )

    @Test
    fun `a slow short scroll does not arm the scene - Focal scrolls like Script`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0))
        scene.tick(frame(100.0, 10.0)) // 100 dp/s
        assertThat(scene.isActive).isTrue()
        assertThat(scene.isArmed).isFalse()
        assertThat(scene.detailedId).isNull()
        assertThat(scene.passage).isNull()
    }

    @Test
    fun `a sustained slow scroll arms after four seconds and elects the row nearest the focus line`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0))
        scene.tick(frame(4_000.0, 400.0)) // 100 dp/s, but sustained
        assertThat(scene.isArmed).isTrue()
        assertThat(scene.focusedId).isEqualTo("b")
        assertThat(scene.detailedId).isEqualTo("b")
        val clearance = FocalScrollPerspective.electionClearance(
            isFirstInGroup = true,
            cellHeight = 60.0,
            scale = FocalScrollPerspective.electedScale(false, 360.0),
        )
        assertThat(scene.passage).isEqualTo(FocalPassage("b", clearance.above, clearance.below))
        assertThat(scene.contentScale).isGreaterThan(1f)
    }

    @Test
    fun `a fling arms at once but the card waits for the scroll to slow down`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0))
        scene.tick(frame(16.0, 32.0)) // 2000 dp/s
        assertThat(scene.isArmed).isTrue()
        assertThat(scene.focusedId).isEqualTo("b")
        assertThat(scene.detailedId).isNull()
        scene.tick(frame(32.0, 40.0)) // 500 dp/s
        assertThat(scene.detailedId).isEqualTo("b")
    }

    @Test
    fun `settling reveals the elected row even when the last measured speed was high`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0))
        scene.tick(frame(16.0, 40.0))
        assertThat(scene.detailedId).isNull()
        scene.settle(frame(32.0, 40.0))
        assertThat(scene.detailedId).isEqualTo("b")
    }

    @Test
    fun `flattening returns to Script and the magnificence must be earned again`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0))
        scene.tick(frame(16.0, 40.0))
        scene.settle(frame(32.0, 40.0))
        scene.flatten()
        assertThat(scene.isActive).isFalse()
        assertThat(scene.isArmed).isFalse()
        assertThat(scene.isFlattening).isTrue()
        assertThat(scene.detailedId).isNull()
        assertThat(scene.passage).isNull()
        scene.tick(frame(10_000.0, 40.0))
        scene.tick(frame(10_100.0, 50.0))
        assertThat(scene.isArmed).isFalse()
        assertThat(scene.isFlattening).isFalse()
    }

    @Test
    fun `reduce motion keeps the card but never magnifies the content`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0, reduceMotion = true))
        scene.settle(frame(4_000.0, 0.0, reduceMotion = true))
        scene.tick(frame(4_000.0, 0.0, reduceMotion = true))
        scene.tick(frame(4_020.0, 0.0, reduceMotion = true))
        assertThat(scene.detailedId).isEqualTo("b")
        assertThat(scene.contentScale).isEqualTo(1f)
    }

    @Test
    fun `only messages are elected - a day pill under the focus line never wins`() {
        val scene = FocalSceneState()
        scene.tick(frame(0.0, 0.0, focusY = 300.0))
        scene.tick(frame(16.0, 40.0, focusY = 300.0))
        assertThat(scene.focusedId).isAnyOf("a", "b")
    }
}
