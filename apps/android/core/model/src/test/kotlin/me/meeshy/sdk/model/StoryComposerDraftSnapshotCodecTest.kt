package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class StoryComposerDraftSnapshotCodecTest {

    private val json = Json { ignoreUnknownKeys = true }

    private fun stroke() = StoryDrawingStroke(
        id = "k1",
        points = listOf(StoryDrawingStrokePoint(0.1, 0.2), StoryDrawingStrokePoint(0.3, 0.4, 0.5)),
        colorHex = "#FF2E63",
        width = 6.0,
    )

    private fun withStrokes() = StoryComposerDraftSnapshot(
        slides = listOf(StoryDraftSlideSnapshot(id = "s1", strokes = listOf(stroke()), canvasFormat = "landscape")),
        selectedId = "s1",
    )

    @Test
    fun `drawn strokes survive an encode and decode`() {
        val snapshot = withStrokes()
        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), json.encodeToString(StoryComposerDraftSnapshot.serializer(), snapshot))
        assertThat(decoded.slides.single().strokes).containsExactly(stroke())
        assertThat(decoded.slides.single().canvasFormat).isEqualTo("landscape")
        assertThat(decoded.isWorthRestoring).isTrue()
    }

    @Test
    fun `an old blob without strokes decodes without error`() {
        val old = """{"slides":[{"id":"s1","text":"hi"}],"selectedId":"s1","visibility":"PUBLIC"}"""
        val decoded = json.decodeFromString(StoryComposerDraftSnapshot.serializer(), old)
        assertThat(decoded.slides.single().strokes).isEmpty()
        assertThat(decoded.slides.single().canvasFormat).isNull()
        assertThat(decoded.isWorthRestoring).isTrue()
    }

    @Test
    fun `a slide with only strokes is worth restoring and a content change in strokes is a different draft`() {
        val a = withStrokes()
        val b = a.copy(slides = a.slides.map { it.copy(strokes = emptyList()) })
        assertThat(a.sameContentAs(b)).isFalse()
        assertThat(b.isWorthRestoring).isFalse()
    }
}
