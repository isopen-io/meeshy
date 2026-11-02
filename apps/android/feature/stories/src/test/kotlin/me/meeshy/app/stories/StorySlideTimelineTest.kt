package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StorySlideTimelineTest {

    private fun slide(
        stickers: List<StoryStickerView> = emptyList(),
        chips: List<StoryAudioChipView> = emptyList(),
    ) = StorySlideView(
        id = "s",
        text = "",
        isTranslated = false,
        imageUrl = null,
        accentHex = "FF6B6B",
        stickers = stickers,
        audioChips = chips,
    )

    private fun sticker(startTime: Double = 0.0, duration: Double = 0.0, fadeIn: Double = 0.0) =
        StoryStickerView(
            id = "k", emoji = "🔥", imageUrl = null, x = 0.5, y = 0.5, rotation = 0.0, sideFraction = 0.2,
            startTime = startTime, duration = duration, fadeIn = fadeIn,
        )

    @Test
    fun `an empty or static scene never reads the playhead`() {
        assertThat(slide().needsPlayhead).isFalse()
        assertThat(slide(stickers = listOf(sticker())).needsPlayhead).isFalse()
    }

    @Test
    fun `a sticker with a window or a fade makes the scene read the playhead`() {
        assertThat(slide(stickers = listOf(sticker(startTime = 1.0))).needsPlayhead).isTrue()
        assertThat(slide(stickers = listOf(sticker(duration = 2.0))).needsPlayhead).isTrue()
        assertThat(slide(stickers = listOf(sticker(fadeIn = 0.5))).needsPlayhead).isTrue()
    }

    @Test
    fun `a timed audio chip makes the scene read the playhead`() {
        val chip = StoryAudioChipView(
            id = "a", x = 0.5, y = 0.5, credit = null, waveform = emptyList(), startTime = 1.0,
        )
        assertThat(slide(chips = listOf(chip)).needsPlayhead).isTrue()
    }
}
