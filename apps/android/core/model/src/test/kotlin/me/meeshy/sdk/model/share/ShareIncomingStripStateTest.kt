package me.meeshy.sdk.model.share

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ShareIncomingStripStateTest {
    private fun media(n: Int) = List(n) { ShareMedia(id = "m$it", mimeType = if (it % 2 == 0) "image/png" else "video/mp4", bytes = 1L) }

    private fun incoming(n: Int, text: String? = "légende") = ShareSubject.Incoming(text, media(n))

    private fun ids(subject: ShareSubject.Incoming) = subject.media.map { it.id }

    @Test
    fun `removing a file keeps the others in order`() {
        assertThat(ids(incoming(3).removingMedia("m1"))).containsExactly("m0", "m2").inOrder()
    }

    @Test
    fun `the last remaining file cannot be removed`() {
        val one = incoming(1)
        assertThat(one.removingMedia("m0")).isEqualTo(one)
    }

    @Test
    fun `removing an unknown id changes nothing`() {
        val three = incoming(3)
        assertThat(three.removingMedia("zzz")).isEqualTo(three)
    }

    @Test
    fun `moving forward swaps with the previous and backward with the next`() {
        assertThat(ids(incoming(3).movingMedia("m1", -1))).containsExactly("m1", "m0", "m2").inOrder()
        assertThat(ids(incoming(3).movingMedia("m1", 1))).containsExactly("m0", "m2", "m1").inOrder()
    }

    @Test
    fun `moving past an end changes nothing`() {
        val three = incoming(3)
        assertThat(three.movingMedia("m0", -1)).isEqualTo(three)
        assertThat(three.movingMedia("m2", 1)).isEqualTo(three)
        assertThat(three.movingMedia("zzz", 1)).isEqualTo(three)
    }

    @Test
    fun `trimming removes the last N but always keeps one`() {
        assertThat(ids(incoming(5).trimmingOverflow(2))).containsExactly("m0", "m1", "m2").inOrder()
        assertThat(ids(incoming(3).trimmingOverflow(10))).containsExactly("m0")
        val three = incoming(3)
        assertThat(three.trimmingOverflow(0)).isEqualTo(three)
    }

    @Test
    fun `trimming the overflow of the plan makes the share sendable`() {
        val big = ShareSubject.Incoming(null, List(ShareLimits.MAX_FILES + 4) { ShareMedia("m$it", "image/png", 1L) })
        val plan = SharePlanner.plan(big.entry(), listOf(ShareDestination("d")))
        assertThat(plan.canSend).isFalse()
        val trimmed = big.trimmingOverflow(plan.limits.trimCount)
        assertThat(SharePlanner.plan(trimmed.entry(), listOf(ShareDestination("d"))).canSend).isTrue()
    }

    @Test
    fun `tiles are numbered from one and the ones past the fitting count are over the limit`() {
        val tiles = ShareIncomingStrip.tiles(media(4), fittingCount = 2)
        assertThat(tiles.map { it.number }).containsExactly(1, 2, 3, 4).inOrder()
        assertThat(tiles.map { it.isOverLimit }).containsExactly(false, false, true, true).inOrder()
        assertThat(tiles.map { it.kind }).containsExactly(
            SharePieceKind.IMAGE, SharePieceKind.VIDEO, SharePieceKind.IMAGE, SharePieceKind.VIDEO,
        ).inOrder()
    }

    @Test
    fun `a tile can move only where there is room and shows a cross only with several files`() {
        val tiles = ShareIncomingStrip.tiles(media(3), fittingCount = 3)
        assertThat(tiles.map { it.canMoveForward }).containsExactly(false, true, true).inOrder()
        assertThat(tiles.map { it.canMoveBackward }).containsExactly(true, true, false).inOrder()
        assertThat(tiles.all { it.removable }).isTrue()
        assertThat(ShareIncomingStrip.tiles(media(1), 1).single().removable).isFalse()
    }

    @Test
    fun `a file without an id is keyed by its position`() {
        val subject = ShareSubject.Incoming(null, listOf(ShareMedia(mimeType = "image/png"), ShareMedia(mimeType = "image/png")))
        val tiles = ShareIncomingStrip.tiles(subject.media, 2)
        assertThat(tiles.map { it.key }).containsExactly("0", "1").inOrder()
        assertThat(subject.removingMedia("0").media).hasSize(1)
    }
}
