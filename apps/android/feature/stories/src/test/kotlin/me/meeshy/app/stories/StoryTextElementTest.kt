package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure on-canvas text-element model: normalised-position
 * clamping, drag translation, publishability, and the wire mapping. No Android,
 * no I/O — the clamp lives here so the deck reducer and the canvas stay glue.
 */
@RunWith(JUnit4::class)
class StoryTextElementTest {

    @Test
    fun `a fresh element sits at the canvas centre with default style`() {
        val element = StoryTextElement(id = "e1")
        assertThat(element.x).isEqualTo(0.5f)
        assertThat(element.y).isEqualTo(0.5f)
        assertThat(element.style).isEqualTo(StoryTextStyle.BOLD)
        assertThat(element.align).isEqualTo(StoryTextAlign.CENTER)
        assertThat(element.color).isEqualTo(StoryTextElement.DEFAULT_COLOR)
    }

    @Test
    fun `an empty or blank element is not publishable`() {
        assertThat(StoryTextElement(id = "e1", text = "").isPublishable).isFalse()
        assertThat(StoryTextElement(id = "e1", text = "   ").isPublishable).isFalse()
    }

    @Test
    fun `a non-blank element is publishable`() {
        assertThat(StoryTextElement(id = "e1", text = "Bonjour").isPublishable).isTrue()
    }

    // --- normalised ---

    @Test
    fun `normalised clamps out-of-range coordinates into the canvas`() {
        val element = StoryTextElement(id = "e1", x = -0.4f, y = 1.7f).normalised()
        assertThat(element.x).isEqualTo(0f)
        assertThat(element.y).isEqualTo(1f)
    }

    @Test
    fun `normalised leaves an in-range coordinate untouched`() {
        val element = StoryTextElement(id = "e1", x = 0.3f, y = 0.8f)
        assertThat(element.normalised()).isEqualTo(element)
    }

    // --- nudged ---

    @Test
    fun `nudged translates by the normalised delta`() {
        val moved = StoryTextElement(id = "e1", x = 0.5f, y = 0.5f).nudged(dx = 0.2f, dy = -0.1f)
        assertThat(moved.x).isWithin(1e-6f).of(0.7f)
        assertThat(moved.y).isWithin(1e-6f).of(0.4f)
    }

    @Test
    fun `nudged past an edge clamps to the canvas boundary`() {
        val pinnedRightBottom = StoryTextElement(id = "e1", x = 0.9f, y = 0.95f).nudged(dx = 0.5f, dy = 0.5f)
        assertThat(pinnedRightBottom.x).isEqualTo(1f)
        assertThat(pinnedRightBottom.y).isEqualTo(1f)

        val pinnedLeftTop = StoryTextElement(id = "e1", x = 0.1f, y = 0.05f).nudged(dx = -0.5f, dy = -0.5f)
        assertThat(pinnedLeftTop.x).isEqualTo(0f)
        assertThat(pinnedLeftTop.y).isEqualTo(0f)
    }

    @Test
    fun `nudged preserves identity text and style`() {
        val original = StoryTextElement(id = "e1", text = "Hi", style = StoryTextStyle.NEON, color = "FF0000")
        val moved = original.nudged(dx = 0.1f, dy = 0.1f)
        assertThat(moved.id).isEqualTo("e1")
        assertThat(moved.text).isEqualTo("Hi")
        assertThat(moved.style).isEqualTo(StoryTextStyle.NEON)
        assertThat(moved.color).isEqualTo("FF0000")
    }

    // --- toTextObject ---

    @Test
    fun `toTextObject maps the owned fields to gateway wire strings`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "Salut",
            style = StoryTextStyle.HANDWRITING,
            color = "00FF00",
            align = StoryTextAlign.RIGHT,
            x = 0.25f,
            y = 0.75f,
        ).toTextObject(sourceLanguage = "fr")

        assertThat(wire.id).isEqualTo("e1")
        assertThat(wire.text).isEqualTo("Salut")
        assertThat(wire.textStyle).isEqualTo("handwriting")
        assertThat(wire.textColor).isEqualTo("00FF00")
        assertThat(wire.textAlign).isEqualTo("right")
        assertThat(wire.sourceLanguage).isEqualTo("fr")
        assertThat(wire.x).isWithin(1e-9).of(0.25)
        assertThat(wire.y).isWithin(1e-9).of(0.75)
    }

    @Test
    fun `every style and align exposes a distinct lowercase wire token`() {
        assertThat(StoryTextStyle.entries.map { it.wire })
            .containsExactly("bold", "neon", "typewriter", "handwriting", "classic")
        assertThat(StoryTextAlign.entries.map { it.wire })
            .containsExactly("left", "center", "right")
    }
}
