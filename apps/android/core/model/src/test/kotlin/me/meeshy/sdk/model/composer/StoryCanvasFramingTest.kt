package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCanvasFramingTest {
    private fun input(
        presentation: StoryCanvasFraming.Presentation,
        bottomInset: Float = 0f,
        headerInset: Float = 0f,
        sideInset: Float = 0f,
        alignment: StoryCanvasFraming.VerticalAlignment = StoryCanvasFraming.VerticalAlignment.CENTER,
        viewportWidth: Float = 360f,
        viewportHeight: Float = 640f,
    ) = StoryCanvasFraming.Input(
        viewportWidth = viewportWidth,
        viewportHeight = viewportHeight,
        headerInset = headerInset,
        bottomInset = bottomInset,
        sideInset = sideInset,
        presentation = presentation,
        cardedCornerRadius = 24f,
        verticalAlignment = alignment,
    )

    @Test
    fun `free presentation is the identity`() {
        val r = StoryCanvasFraming.resolve(input(StoryCanvasFraming.Presentation.FREE, bottomInset = 300f))
        assertThat(r).isEqualTo(StoryCanvasFraming.Result.IDENTITY)
    }

    @Test
    fun `carded shrinks the whole card above the panel and rounds it`() {
        val r = StoryCanvasFraming.resolve(input(StoryCanvasFraming.Presentation.CARDED, bottomInset = 320f))
        assertThat(r.scale).isWithin(1e-4f).of(0.5f)
        assertThat(r.cornerRadius).isEqualTo(24f)
        assertThat(r.offsetY).isWithin(1e-3f).of(-160f)
    }

    @Test
    fun `carded never upscales past the intrinsic size`() {
        val r = StoryCanvasFraming.resolve(input(StoryCanvasFraming.Presentation.CARDED))
        assertThat(r.scale).isEqualTo(1f)
        assertThat(r.cornerRadius).isEqualTo(24f)
    }

    @Test
    fun `side insets bound the card by width and top alignment sticks it under the header`() {
        val r = StoryCanvasFraming.resolve(
            input(
                StoryCanvasFraming.Presentation.CARDED,
                headerInset = 40f,
                sideInset = 72f,
                alignment = StoryCanvasFraming.VerticalAlignment.TOP,
            ),
        )
        assertThat(r.scale).isWithin(1e-4f).of(0.6f)
        assertThat(r.offsetY).isWithin(1e-3f).of(40f + 640f * 0.6f / 2f - 320f)
    }

    @Test
    fun `bottom alignment sticks the card to the panel`() {
        val r = StoryCanvasFraming.resolve(
            input(
                StoryCanvasFraming.Presentation.CARDED,
                bottomInset = 200f,
                sideInset = 100f,
                alignment = StoryCanvasFraming.VerticalAlignment.BOTTOM,
            ),
        )
        assertThat(r.scale).isWithin(1e-4f).of(160f / 360f)
        val h = 640f * r.scale
        assertThat(r.offsetY).isWithin(1e-3f).of((440f - h / 2f) - 320f)
    }

    @Test
    fun `degenerate region falls back to the identity`() {
        val r = StoryCanvasFraming.resolve(input(StoryCanvasFraming.Presentation.CARDED, bottomInset = 640f))
        assertThat(r).isEqualTo(StoryCanvasFraming.Result.IDENTITY)
    }

    @Test
    fun `immersive covers a taller viewport without stretching`() {
        val r = StoryCanvasFraming.resolve(
            input(StoryCanvasFraming.Presentation.IMMERSIVE, viewportWidth = 400f, viewportHeight = 900f),
        )
        // intrinsic 400 x 711.1 ; cover = 900 / 711.11
        assertThat(r.scale).isWithin(1e-3f).of(900f / (400f * 16f / 9f))
        assertThat(r.cornerRadius).isEqualTo(0f)
        assertThat(r.offsetY).isEqualTo(0f)
    }

    @Test
    fun `carded truth table follows the panel and the two immersions`() {
        val f = StoryCanvasFraming
        assertThat(f.isCarded(bandPresent = false, drawingActive = false, textActive = false)).isFalse()
        assertThat(f.isCarded(bandPresent = true, drawingActive = false, textActive = false)).isTrue()
        assertThat(f.isCarded(bandPresent = false, drawingActive = false, textActive = false, timelineActive = true)).isTrue()
        assertThat(f.isCarded(bandPresent = true, drawingActive = true, textActive = false)).isFalse()
        assertThat(f.isCarded(bandPresent = true, drawingActive = false, textActive = true)).isFalse()
    }

    @Test
    fun `reader presentation maps fullscreen to immersive and chrome to carded`() {
        val f = StoryCanvasFraming
        assertThat(f.readerPresentation(isFullscreenSession = true, chromeVisible = true))
            .isEqualTo(StoryCanvasFraming.Presentation.IMMERSIVE)
        assertThat(f.readerPresentation(isFullscreenSession = false, chromeVisible = true))
            .isEqualTo(StoryCanvasFraming.Presentation.CARDED)
        assertThat(f.readerPresentation(isFullscreenSession = false, chromeVisible = false))
            .isEqualTo(StoryCanvasFraming.Presentation.FREE)
    }

    @Test
    fun `caption column follows the scaled canvas not the host`() {
        assertThat(StoryCanvasFraming.captionColumnWidth(491f, 800f, 9f / 16f, 1f)).isWithin(1e-3f).of(450f)
        assertThat(StoryCanvasFraming.captionColumnWidth(400f, 900f, 9f / 16f, 0.5f)).isWithin(1e-3f).of(200f)
        assertThat(StoryCanvasFraming.captionColumnWidth(400f, 900f, 9f / 16f, -1f)).isEqualTo(0f)
    }

    @Test
    fun `visible-area policy cards on keyboard or panel but never while drawing`() {
        val f = StoryCanvasFraming
        assertThat(f.shouldCard(panelOpen = true, keyboardVisible = false, drawingActive = false)).isTrue()
        assertThat(f.shouldCard(panelOpen = false, keyboardVisible = true, drawingActive = false)).isTrue()
        assertThat(f.shouldCard(panelOpen = false, keyboardVisible = false, drawingActive = false)).isFalse()
        assertThat(f.shouldCard(panelOpen = true, keyboardVisible = true, drawingActive = true)).isFalse()
    }
}
