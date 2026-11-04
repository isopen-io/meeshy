package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.focal.FocalScrollPerspective.CellGeometry
import org.junit.Test

class FocalScrollPerspectiveHostTest {

    private val cells = listOf(
        CellGeometry("far-above", visualMidY = 40.0, height = 60.0, isMessage = true),
        CellGeometry("above", visualMidY = 250.0, height = 60.0, isMessage = true),
        CellGeometry("day", visualMidY = 320.0, height = 30.0, isMessage = false),
        CellGeometry("focus", visualMidY = 400.0, height = 60.0, isMessage = true),
        CellGeometry("below", visualMidY = 560.0, height = 60.0, isMessage = true),
    )

    private fun frame(reduceMotion: Boolean = false, nowMs: Double = 0.0, scrolledDp: Double = 0.0, focusY: Double = 400.0) =
        FocalFrame(nowMs, scrolledDp, cells, focusY, rowWidth = 360.0, reduceMotion = reduceMotion, isFirstInGroup = { true })

    @Test
    fun `chaque cellule recoit une pose et la plus lointaine est la plus petite et la plus pale`() {
        val poses = FocalScrollPerspectiveHost.poses(frame())
        assertThat(poses.keys).containsExactly("far-above", "above", "day", "focus", "below")
        assertThat(poses.getValue("focus").scale).isEqualTo(1.0)
        assertThat(poses.getValue("far-above").scale).isLessThan(poses.getValue("above").scale)
        assertThat(poses.getValue("far-above").alpha).isAtLeast(0.62)
        assertThat(poses.getValue("far-above").alpha).isLessThan(poses.getValue("above").alpha)
    }

    @Test
    fun `les rangees se compactent par tirage cumulatif, vers le bas au dessus de la ligne et vers le haut dessous`() {
        val poses = FocalScrollPerspectiveHost.poses(frame())
        assertThat(poses.getValue("above").pull).isAtLeast(0.0)
        assertThat(poses.getValue("far-above").pull).isAtLeast(poses.getValue("above").pull)
        assertThat(poses.getValue("below").pull).isAtMost(0.0)
    }

    @Test
    fun `une pilule de jour s'estompe sans changer d'echelle`() {
        val day = FocalScrollPerspectiveHost.poses(frame()).getValue("day")
        assertThat(day.scale).isEqualTo(1.0)
    }

    @Test
    fun `la reduction de mouvement rend la pose identite a toutes les cellules`() {
        val poses = FocalScrollPerspectiveHost.poses(frame(reduceMotion = true))
        poses.values.forEach {
            assertThat(it.scale).isEqualTo(1.0)
            assertThat(it.alpha).isEqualTo(1.0)
            assertThat(it.pull).isEqualTo(0.0)
        }
    }

    @Test
    fun `comme sur iOS la compaction des voisines n'est pas appliquee tant que la couture est fermee`() {
        val poses = FocalScrollPerspectiveHost.poses(frame())
        assertThat(FocalScrollPerspectiveHost.APPLIES_TO_NEIGHBORS).isFalse()
        assertThat(FocalScrollPerspectiveHost.appliedPose(poses, "above")).isNull()
    }

    @Test
    fun `l'elu ne clignote pas entre deux voisines a quasi egale distance`() {
        val scene = FocalSceneState()
        scene.tick(frame(nowMs = 0.0))
        scene.tick(frame(nowMs = 4_000.0, scrolledDp = 400.0, focusY = 400.0))
        assertThat(scene.focusedId).isEqualTo("focus")
        listOf(402.0, 398.0, 405.0, 395.0).forEachIndexed { i, y ->
            scene.tick(frame(nowMs = 4_100.0 + i * 100, scrolledDp = 401.0 + i, focusY = y))
            assertThat(scene.focusedId).isEqualTo("focus")
        }
    }

    @Test
    fun `l'armement attend quatre secondes sur l'horloge virtuelle puis reste arme`() {
        val scene = FocalSceneState()
        scene.tick(frame(nowMs = 0.0))
        scene.tick(frame(nowMs = 3_900.0, scrolledDp = 100.0))
        assertThat(scene.isArmed).isFalse()
        scene.tick(frame(nowMs = 4_000.0, scrolledDp = 101.0))
        assertThat(scene.isArmed).isTrue()
        scene.tick(frame(nowMs = 4_100.0, scrolledDp = 102.0))
        assertThat(scene.isArmed).isTrue()
    }
}
