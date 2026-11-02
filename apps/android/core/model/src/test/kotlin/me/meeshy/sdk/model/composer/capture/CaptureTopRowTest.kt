package me.meeshy.sdk.model.composer.capture

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.capture.CaptureTopRow.Item
import org.junit.Test

class CaptureTopRowTest {
    private fun input(
        stage: CaptureStage = CaptureStage.ARMED,
        editing: Boolean = false,
        pending: Int = 0,
        size: Boolean = true,
        save: Boolean = false,
    ) = CaptureTopRow.Input(stage, editing, pending, size, save)

    @Test
    fun `armed row is the close cross then size, flash and flip at the edge`() {
        assertThat(CaptureTopRow.leading(input())).containsExactly(Item.CLOSE).inOrder()
        assertThat(CaptureTopRow.trailing(input())).containsExactly(Item.SIZE, Item.FLASH, Item.FLIP).inOrder()
    }

    @Test
    fun `flip sits right of the flash`() {
        val t = CaptureTopRow.trailing(input())
        assertThat(t.indexOf(Item.FLIP)).isGreaterThan(t.indexOf(Item.FLASH))
    }

    @Test
    fun `recording keeps only the cross and the chrono`() {
        val i = input(stage = CaptureStage.RECORDING)
        assertThat(CaptureTopRow.leading(i)).containsExactly(Item.CLOSE, Item.CHRONO).inOrder()
        assertThat(CaptureTopRow.trailing(i)).isEmpty()
    }

    @Test
    fun `pending segments swap the size toggle for the segment controls left of flash`() {
        val i = input(pending = 2)
        assertThat(CaptureTopRow.leading(i)).containsExactly(Item.CLOSE, Item.CHRONO).inOrder()
        assertThat(CaptureTopRow.trailing(i))
            .containsExactly(Item.DROP_SEGMENT, Item.VALIDATE, Item.FLASH, Item.FLIP).inOrder()
    }

    @Test
    fun `no size toggle offered means none shown`() {
        assertThat(CaptureTopRow.trailing(input(size = false))).containsExactly(Item.FLASH, Item.FLIP).inOrder()
    }

    @Test
    fun `editing shows size, optional save, then done`() {
        assertThat(CaptureTopRow.leading(input(editing = true, stage = CaptureStage.RECORDING))).containsExactly(Item.CLOSE)
        assertThat(CaptureTopRow.trailing(input(editing = true, save = true)))
            .containsExactly(Item.SIZE, Item.SAVE, Item.DONE).inOrder()
        assertThat(CaptureTopRow.trailing(input(editing = true))).containsExactly(Item.SIZE, Item.DONE).inOrder()
    }

    @Test
    fun `segment count includes the one being written`() {
        assertThat(CaptureTopRow.segmentCount(pending = 0, recording = true)).isEqualTo(1)
        assertThat(CaptureTopRow.segmentCount(pending = 2, recording = false)).isEqualTo(2)
        assertThat(CaptureTopRow.segmentCount(pending = -3, recording = false)).isEqualTo(0)
    }

    @Test
    fun `badge is the number and a dash`() {
        assertThat(CaptureTopRow.segmentBadge(3)).isEqualTo("3 –")
        assertThat(CaptureTopRow.segmentBadge(-1)).isEqualTo("0 –")
    }

    @Test
    fun `flash slider inset counts the controls right of the flash`() {
        val t = CaptureTopRow.trailing(input())
        assertThat(CaptureTopRow.flashSliderTrailingInsetDp(t, tapTargetDp = 44f)).isEqualTo(1 * (44f + CaptureTopRow.SPACING_DP))
        assertThat(CaptureTopRow.flashSliderTrailingInsetDp(emptyList(), 44f)).isEqualTo(0f)
    }
}
