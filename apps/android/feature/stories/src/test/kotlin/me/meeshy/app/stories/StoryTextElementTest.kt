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
    fun `a fresh element has no text backing`() {
        assertThat(StoryTextElement(id = "e1").background).isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `toTextObject omits the backgroundStyle when the element has no backing`() {
        val wire = StoryTextElement(id = "e1", text = "hi").toTextObject(sourceLanguage = "fr")
        assertThat(wire.backgroundStyle).isNull()
    }

    @Test
    fun `toTextObject carries a solid backing as the solid tagged union`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            background = StoryTextBackground.Solid(hex = "F472B6"),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.backgroundStyle?.type).isEqualTo("solid")
        assertThat(wire.backgroundStyle?.hex).isEqualTo("F472B6")
    }

    @Test
    fun `toTextObject carries a glass backing as the glass tagged union`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            background = StoryTextBackground.Glass(radius = 24.0),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.backgroundStyle?.type).isEqualTo("glass")
        assertThat(wire.backgroundStyle?.radius).isEqualTo(24.0)
    }

    @Test
    fun `a fresh element has no outline`() {
        val outline = StoryTextElement(id = "e1").outline
        assertThat(outline.width).isEqualTo(StoryTextOutline.NONE_WIDTH)
        assertThat(outline.color).isNull()
    }

    @Test
    fun `toTextObject omits the border when the element has no outline`() {
        val wire = StoryTextElement(id = "e1", text = "hi").toTextObject(sourceLanguage = "fr")
        assertThat(wire.borderWidth).isNull()
        assertThat(wire.borderColor).isNull()
    }

    @Test
    fun `toTextObject carries a stroked outline as borderColor and borderWidth`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            outline = StoryTextOutline(width = 4f, color = "FF2E63"),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.borderWidth).isWithin(1e-9).of(4.0)
        assertThat(wire.borderColor).isEqualTo("FF2E63")
    }

    @Test
    fun `toTextObject keeps a retained colour off the wire while the outline has no width`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            outline = StoryTextOutline(width = 0f, color = "FF2E63"),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.borderWidth).isNull()
        assertThat(wire.borderColor).isNull()
    }

    @Test
    fun `a fresh element is born at the iOS-parity medium size`() {
        assertThat(StoryTextElement(id = "e1").size).isEqualTo(StoryTextSize.MEDIUM)
    }

    @Test
    fun `toTextObject carries the default medium size as the iOS-parity fontSize 96`() {
        val wire = StoryTextElement(id = "e1", text = "hi").toTextObject(sourceLanguage = "fr")
        assertThat(wire.fontSize).isWithin(1e-9).of(96.0)
    }

    @Test
    fun `toTextObject carries a chosen size onto the wire fontSize`() {
        val wire = StoryTextElement(id = "e1", text = "hi", size = StoryTextSize.XLARGE)
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.fontSize).isWithin(1e-9).of(200.0)
    }

    @Test
    fun `a fresh element has no fade timing`() {
        val fade = StoryTextElement(id = "e1").fade
        assertThat(fade.hasFadeIn).isFalse()
        assertThat(fade.hasFadeOut).isFalse()
    }

    @Test
    fun `toTextObject omits both fade fields when the element has no fade`() {
        val wire = StoryTextElement(id = "e1", text = "hi").toTextObject(sourceLanguage = "fr")
        assertThat(wire.fadeIn).isNull()
        assertThat(wire.fadeOut).isNull()
    }

    @Test
    fun `toTextObject carries a chosen fade-in onto the wire fadeIn only`() {
        val wire = StoryTextElement(id = "e1", text = "hi", fade = StoryTextFade(inSeconds = 2f))
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.fadeIn).isWithin(1e-9).of(2.0)
        assertThat(wire.fadeOut).isNull()
    }

    @Test
    fun `toTextObject carries a chosen fade-out onto the wire fadeOut only`() {
        val wire = StoryTextElement(id = "e1", text = "hi", fade = StoryTextFade(outSeconds = 3f))
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.fadeOut).isWithin(1e-9).of(3.0)
        assertThat(wire.fadeIn).isNull()
    }

    @Test
    fun `toTextObject carries both fade ends when both are set`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            fade = StoryTextFade(inSeconds = 0.5f, outSeconds = 5f),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.fadeIn).isWithin(1e-9).of(0.5)
        assertThat(wire.fadeOut).isWithin(1e-9).of(5.0)
    }

    @Test
    fun `a fresh element has no visibility timing`() {
        val timing = StoryTextElement(id = "e1").timing
        assertThat(timing.hasStart).isFalse()
        assertThat(timing.isTimed).isFalse()
    }

    @Test
    fun `toTextObject omits both timing fields when the element has no timing`() {
        val wire = StoryTextElement(id = "e1", text = "hi").toTextObject(sourceLanguage = "fr")
        assertThat(wire.startTime).isNull()
        assertThat(wire.duration).isNull()
    }

    @Test
    fun `toTextObject carries a chosen start onto the wire startTime only`() {
        val wire = StoryTextElement(id = "e1", text = "hi", timing = StoryElementTiming(startSeconds = 2f))
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.startTime).isWithin(1e-9).of(2.0)
        assertThat(wire.duration).isNull()
    }

    @Test
    fun `toTextObject carries a chosen duration onto the wire duration only`() {
        val wire = StoryTextElement(id = "e1", text = "hi", timing = StoryElementTiming(durationSeconds = 5f))
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.duration).isWithin(1e-9).of(5.0)
        assertThat(wire.startTime).isNull()
    }

    @Test
    fun `toTextObject carries both timing ends when both are set`() {
        val wire = StoryTextElement(
            id = "e1",
            text = "hi",
            timing = StoryElementTiming(startSeconds = 3f, durationSeconds = 10f),
        ).toTextObject(sourceLanguage = "fr")
        assertThat(wire.startTime).isWithin(1e-9).of(3.0)
        assertThat(wire.duration).isWithin(1e-9).of(10.0)
    }

    @Test
    fun `every style and align exposes a distinct lowercase wire token`() {
        assertThat(StoryTextStyle.entries.map { it.wire })
            .containsExactly("bold", "neon", "typewriter", "handwriting", "classic")
        assertThat(StoryTextAlign.entries.map { it.wire })
            .containsExactly("left", "center", "right")
    }

    // --- scale / rotation: defaults ---

    @Test
    fun `a fresh element renders at rest — unit scale, upright`() {
        val element = StoryTextElement(id = "e1")
        assertThat(element.scale).isEqualTo(StoryTextElement.DEFAULT_SCALE)
        assertThat(element.rotationDeg).isEqualTo(StoryTextElement.DEFAULT_ROTATION)
    }

    // --- transformed: scale ---

    @Test
    fun `transformed multiplies the scale by the pinch factor`() {
        val element = StoryTextElement(id = "e1", scale = 1.5f).transformed(scaleBy = 2f, rotateByDeg = 0f)
        assertThat(element.scale).isWithin(1e-6f).of(3f)
    }

    @Test
    fun `transformed clamps the scale at the pinch ceiling`() {
        val element = StoryTextElement(id = "e1", scale = 3f).transformed(scaleBy = 10f, rotateByDeg = 0f)
        assertThat(element.scale).isEqualTo(StoryTextElement.MAX_SCALE)
    }

    @Test
    fun `transformed clamps the scale at the pinch floor`() {
        val element = StoryTextElement(id = "e1", scale = 0.5f).transformed(scaleBy = 0.1f, rotateByDeg = 0f)
        assertThat(element.scale).isEqualTo(StoryTextElement.MIN_SCALE)
    }

    @Test
    fun `transformed with a non-positive factor collapses to the floor`() {
        val element = StoryTextElement(id = "e1", scale = 2f).transformed(scaleBy = 0f, rotateByDeg = 0f)
        assertThat(element.scale).isEqualTo(StoryTextElement.MIN_SCALE)
    }

    @Test
    fun `transformed with a non-finite factor falls back to the default scale`() {
        val element = StoryTextElement(id = "e1", scale = 2f).transformed(scaleBy = Float.NaN, rotateByDeg = 0f)
        assertThat(element.scale).isEqualTo(StoryTextElement.DEFAULT_SCALE)
    }

    // --- transformed: rotation ---

    @Test
    fun `transformed adds the rotation delta`() {
        val element = StoryTextElement(id = "e1", rotationDeg = 30f).transformed(scaleBy = 1f, rotateByDeg = 45f)
        assertThat(element.rotationDeg).isWithin(1e-4f).of(75f)
    }

    @Test
    fun `transformed wraps rotation past the positive half-turn`() {
        val element = StoryTextElement(id = "e1", rotationDeg = 170f).transformed(scaleBy = 1f, rotateByDeg = 100f)
        assertThat(element.rotationDeg).isWithin(1e-4f).of(-90f)
    }

    @Test
    fun `transformed wraps rotation past the negative half-turn`() {
        val element = StoryTextElement(id = "e1", rotationDeg = -170f).transformed(scaleBy = 1f, rotateByDeg = -100f)
        assertThat(element.rotationDeg).isWithin(1e-4f).of(90f)
    }

    @Test
    fun `transformed preserves identity, text, style, and position`() {
        val original = StoryTextElement(
            id = "e1", text = "Hi", style = StoryTextStyle.NEON, color = "FF0000", x = 0.3f, y = 0.7f,
        )
        val transformed = original.transformed(scaleBy = 2f, rotateByDeg = 15f)
        assertThat(transformed.id).isEqualTo("e1")
        assertThat(transformed.text).isEqualTo("Hi")
        assertThat(transformed.style).isEqualTo(StoryTextStyle.NEON)
        assertThat(transformed.color).isEqualTo("FF0000")
        assertThat(transformed.x).isEqualTo(0.3f)
        assertThat(transformed.y).isEqualTo(0.7f)
    }

    // --- clampScale / normaliseRotation (the pure rules) ---

    @Test
    fun `clampScale pins out-of-range factors to the bounds and passes through valid ones`() {
        assertThat(StoryTextElement.clampScale(0.1f)).isEqualTo(StoryTextElement.MIN_SCALE)
        assertThat(StoryTextElement.clampScale(9f)).isEqualTo(StoryTextElement.MAX_SCALE)
        assertThat(StoryTextElement.clampScale(2f)).isEqualTo(2f)
        assertThat(StoryTextElement.clampScale(Float.POSITIVE_INFINITY))
            .isEqualTo(StoryTextElement.DEFAULT_SCALE)
    }

    @Test
    fun `normaliseRotation reduces to the canonical half-open turn`() {
        assertThat(StoryTextElement.normaliseRotation(0f)).isWithin(1e-4f).of(0f)
        assertThat(StoryTextElement.normaliseRotation(180f)).isWithin(1e-4f).of(180f)
        assertThat(StoryTextElement.normaliseRotation(-180f)).isWithin(1e-4f).of(180f)
        assertThat(StoryTextElement.normaliseRotation(360f)).isWithin(1e-4f).of(0f)
        assertThat(StoryTextElement.normaliseRotation(540f)).isWithin(1e-4f).of(180f)
        assertThat(StoryTextElement.normaliseRotation(270f)).isWithin(1e-4f).of(-90f)
        assertThat(StoryTextElement.normaliseRotation(Float.NaN))
            .isEqualTo(StoryTextElement.DEFAULT_ROTATION)
    }

    // --- normalised covers scale + rotation too ---

    @Test
    fun `normalised clamps an out-of-range scale and wraps rotation`() {
        val element = StoryTextElement(id = "e1", scale = 99f, rotationDeg = 450f).normalised()
        assertThat(element.scale).isEqualTo(StoryTextElement.MAX_SCALE)
        assertThat(element.rotationDeg).isWithin(1e-4f).of(90f)
    }

    @Test
    fun `normalised leaves an in-range scale and rotation untouched`() {
        val element = StoryTextElement(id = "e1", scale = 2f, rotationDeg = 30f)
        assertThat(element.normalised()).isEqualTo(element)
    }

    @Test
    fun `toTextObject carries the element scale and rotation onto the wire`() {
        val wire = StoryTextElement(id = "e1", text = "Hi", scale = 2.5f, rotationDeg = 42f)
            .toTextObject(sourceLanguage = "fr")
        assertThat(wire.scale).isWithin(1e-6).of(2.5)
        assertThat(wire.rotation).isWithin(1e-4).of(42.0)
    }

    // --- baseDirection: derived from the caption, iOS-parity render-time direction ---

    @Test
    fun `a fresh empty element lays out left-to-right`() {
        assertThat(StoryTextElement(id = "e1").baseDirection).isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `a latin caption lays out left-to-right`() {
        assertThat(StoryTextElement(id = "e1", text = "Bonjour").baseDirection)
            .isEqualTo(StoryTextDirection.LTR)
    }

    @Test
    fun `an arabic caption lays out right-to-left`() {
        assertThat(StoryTextElement(id = "e1", text = "مرحبا").baseDirection)
            .isEqualTo(StoryTextDirection.RTL)
    }
}
