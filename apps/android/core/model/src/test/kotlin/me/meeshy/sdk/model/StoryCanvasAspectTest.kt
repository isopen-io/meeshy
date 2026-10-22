package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryCanvasAspectTest {
    @Test
    fun `une image de fond plus large que haute impose le paysage`() {
        assertThat(StoryCanvasAspect.from(1920.0, 1080.0)).isEqualTo(StoryCanvasAspect.LANDSCAPE)
    }

    @Test
    fun `portrait carre ou dimensions invalides restent verticaux`() {
        assertThat(StoryCanvasAspect.from(1080.0, 1920.0)).isEqualTo(StoryCanvasAspect.PORTRAIT)
        assertThat(StoryCanvasAspect.from(1000.0, 1000.0)).isEqualTo(StoryCanvasAspect.PORTRAIT)
        assertThat(StoryCanvasAspect.from(0.0, 10.0)).isEqualTo(StoryCanvasAspect.PORTRAIT)
    }

    @Test
    fun `un ratio persiste superieur a un est paysage`() {
        assertThat(StoryCanvasAspect.from(1.78)).isEqualTo(StoryCanvasAspect.LANDSCAPE)
        assertThat(StoryCanvasAspect.from(1.0)).isEqualTo(StoryCanvasAspect.PORTRAIT)
        assertThat(StoryCanvasAspect.from(null as Double?)).isEqualTo(StoryCanvasAspect.PORTRAIT)
    }

    @Test
    fun `les ratios sont ceux de la scene`() {
        assertThat(StoryCanvasAspect.PORTRAIT.ratio).isWithin(1e-9).of(0.5625)
        assertThat(StoryCanvasAspect.LANDSCAPE.ratio).isWithin(1e-9).of(1.7777777777)
    }
}
