package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EmojiPickerLayoutTest {

    @Test
    fun `the ceiling is eighty five percent of the container capped at 620`() {
        assertThat(EmojiPickerLayout.maxHeight(600f)).isWithin(0.01f).of(510f)
        assertThat(EmojiPickerLayout.maxHeight(1400f)).isEqualTo(620f)
    }

    @Test
    fun `the height never leaves the floor and the ceiling`() {
        assertThat(EmojiPickerLayout.currentHeight(340f, 200f, 800f)).isEqualTo(340f)
        assertThat(EmojiPickerLayout.currentHeight(340f, -900f, 800f)).isEqualTo(680f)
        assertThat(EmojiPickerLayout.currentHeight(400f, 20f, 800f)).isEqualTo(380f)
    }

    @Test
    fun `a pull down dismisses a compact sheet and only collapses an expanded one`() {
        assertThat(EmojiPickerLayout.dragOutcome(120f, 0f, 340f)).isEqualTo(ReactionSheetDragOutcome.Dismiss)
        assertThat(EmojiPickerLayout.dragOutcome(120f, 0f, 600f)).isEqualTo(ReactionSheetDragOutcome.Collapse)
        assertThat(EmojiPickerLayout.dragOutcome(10f, 400f, 340f)).isEqualTo(ReactionSheetDragOutcome.Dismiss)
    }

    @Test
    fun `a pull up expands and a short drag settles`() {
        assertThat(EmojiPickerLayout.dragOutcome(-90f, 0f, 340f)).isEqualTo(ReactionSheetDragOutcome.Expand)
        assertThat(EmojiPickerLayout.dragOutcome(30f, 0f, 340f)).isEqualTo(ReactionSheetDragOutcome.Settle)
    }

    @Test
    fun `rows round up over eight columns`() {
        assertThat(EmojiPickerLayout.gridRows(32)).isEqualTo(4)
        assertThat(EmojiPickerLayout.gridRows(24)).isEqualTo(3)
        assertThat(EmojiPickerLayout.gridRows(25)).isEqualTo(4)
    }
}
