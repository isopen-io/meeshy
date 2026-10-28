package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.scene.StoryTextFrame
import me.meeshy.sdk.model.scene.StoryTextFrameShape
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class StoryComposerTextReducerTest {

    private fun state(): StoryComposerUiState = StoryComposerUiState()

    private fun withElement(id: String = "t1"): StoryComposerUiState =
        StoryComposerTextReducer.added(state(), id)

    @Test
    fun `typing without a selected element rewrites the slide caption`() {
        val after = StoryComposerTextReducer.typed(state(), "hello")

        assertThat(after.draft.text).isEqualTo("hello")
        assertThat(after.deck.selectedSlide.text).isEqualTo("hello")
    }

    @Test
    fun `typing with a selected element rewrites that element and leaves the caption`() {
        val after = StoryComposerTextReducer.typed(withElement(), "on canvas")

        assertThat(after.selectedTextElement?.text).isEqualTo("on canvas")
        assertThat(after.draft.text).isEmpty()
    }

    @Test
    fun `adding an element selects it and clears the sticker selection`() {
        val after = withElement("t1")

        assertThat(after.selectedTextElementId).isEqualTo("t1")
        assertThat(after.selectedStickerId).isNull()
        assertThat(after.deck.selectedSlide.elements.map { it.id }).containsExactly("t1")
    }

    @Test
    fun `adding past the cap warns and leaves the deck untouched`() {
        val full = (1..StorySlideDeck.MAX_TEXT_ELEMENTS_PER_SLIDE).fold(state()) { acc, i ->
            StoryComposerTextReducer.added(acc, "t$i")
        }

        val after = StoryComposerTextReducer.added(full, "extra")

        assertThat(after.errorMessage).isEqualTo(StoryComposerViewModel.TEXT_ELEMENT_LIMIT)
        assertThat(after.deck).isEqualTo(full.deck)
    }

    @Test
    fun `selecting an unknown element is inert`() {
        val base = withElement()

        assertThat(StoryComposerTextReducer.selected(base, "ghost")).isSameInstanceAs(base)
    }

    @Test
    fun `deselecting with nothing selected keeps the same instance`() {
        val base = state()

        assertThat(StoryComposerTextReducer.deselected(base)).isSameInstanceAs(base)
    }

    @Test
    fun `opening the menu selects the element and dismissing clears only the menu`() {
        val opened = StoryComposerTextReducer.menuOpened(withElement("t1"), "t1")
        assertThat(opened.elementMenuId).isEqualTo("t1")
        assertThat(opened.selectedTextElementId).isEqualTo("t1")

        val dismissed = StoryComposerTextReducer.menuDismissed(opened)
        assertThat(dismissed.elementMenuId).isNull()
        assertThat(dismissed.selectedTextElementId).isEqualTo("t1")
    }

    @Test
    fun `moving an element reports snap feedback and drag end clears it`() {
        val moved = StoryComposerTextReducer.moved(withElement("t1"), "t1", 0.1f, 0.1f)
        assertThat(moved.snapFeedback).isNotNull()

        assertThat(StoryComposerTextReducer.dragEnded(moved).snapFeedback).isNull()
    }

    @Test
    fun `removing the selected element clears the editing selection`() {
        val after = StoryComposerTextReducer.removed(withElement("t1"), "t1")

        assertThat(after.selectedTextElementId).isNull()
        assertThat(after.deck.selectedSlide.elements).isEmpty()
    }

    @Test
    fun `style colour and align edits target only the named element`() {
        val base = withElement("t1")

        val styled = StoryComposerTextReducer.styled(base, "t1", StoryTextStyle.entries.last())
        val coloured = StoryComposerTextReducer.colored(base, "t1", "FF0000")
        val aligned = StoryComposerTextReducer.aligned(base, "t1", StoryTextAlign.entries.last())

        assertThat(styled.selectedTextElement?.style).isEqualTo(StoryTextStyle.entries.last())
        assertThat(coloured.selectedTextElement?.color).isEqualTo("FF0000")
        assertThat(aligned.selectedTextElement?.align).isEqualTo(StoryTextAlign.entries.last())
    }

    @Test
    fun `cycling the size follows the pure size cycle`() {
        val base = withElement("t1")

        val after = StoryComposerTextReducer.sizeCycled(base, "t1")

        assertThat(after.selectedTextElement?.size)
            .isEqualTo(StoryTextSizeCycle.next(base.selectedTextElement!!.size))
    }

    @Test
    fun `duplicating clones the element offset from its source and selects the copy`() {
        val after = StoryComposerTextReducer.duplicated(withElement("t1"), "t1", "t2")

        assertThat(after.deck.selectedSlide.elements.map { it.id }).containsExactly("t1", "t2").inOrder()
        assertThat(after.selectedTextElementId).isEqualTo("t2")
    }

    @Test
    fun `duplicating an element that is not on the slide is inert`() {
        val base = withElement("t1")

        assertThat(StoryComposerTextReducer.duplicated(base, "ghost", "t2")).isSameInstanceAs(base)
    }

    @Test
    fun `reordering a lone element keeps the same instance`() {
        val base = withElement("t1")

        assertThat(StoryComposerTextReducer.reordered(base, "t1", StoryZOrder.TO_FRONT)).isSameInstanceAs(base)
    }

    // --- cadre, bordure, langue (#13561, #13534) ---

    private fun element(state: StoryComposerUiState, id: String = "t1") =
        state.deck.selectedSlide.elements.first { it.id == id }

    @Test
    fun `choosing a frame shape on a neutral text posts the discreet border and keeps the shape`() {
        val after = StoryComposerTextReducer.frameShaped(withElement(), "t1", StoryTextFrameShape.PILL)
        assertThat(element(after).frame.shape).isEqualTo(StoryTextFrameShape.PILL)
        assertThat(element(after).frame.borderIsVisible).isTrue()
    }

    @Test
    fun `padding and border width are bounded and the border colour is kept at zero`() {
        var state = StoryComposerTextReducer.framePadded(withElement(), "t1", 9f)
        assertThat(element(state).frame.paddingScale).isEqualTo(3f)
        state = StoryComposerTextReducer.frameColored(state, "t1", "FF3B30")
        state = StoryComposerTextReducer.frameBordered(state, "t1", 0f)
        assertThat(element(state).frame.borderWidth).isEqualTo(0f)
        assertThat(element(state).frame.borderColor).isEqualTo("FF3B30")
    }

    @Test
    fun `the border section draws the glyph outline, and a colour wakes it at four`() {
        val coloured = StoryComposerTextReducer.outlineColored(withElement(), "t1", "007AFF")
        assertThat(element(coloured).outline.isVisible).isTrue()
        assertThat(element(coloured).outline.width).isEqualTo(4f)
        val raised = StoryComposerTextReducer.outlineWidened(withElement(), "t1", 7.5f)
        assertThat(element(raised).outline.width).isEqualTo(7.5f)
        assertThat(element(raised).outline.color).isEqualTo("FFFFFF")
    }

    @Test
    fun `the chosen language is stored normalised on the element`() {
        val after = StoryComposerTextReducer.languaged(withElement(), "t1", "pt-BR")
        assertThat(element(after).sourceLanguage).isEqualTo("pt")
        assertThat(element(StoryComposerTextReducer.languaged(after, "t1", " ")).sourceLanguage).isNull()
    }

    @Test
    fun `the language of the author rides the published text, the publication language only fills a gap`() {
        val chosen = element(StoryComposerTextReducer.languaged(withElement(), "t1", "es"))
        assertThat(chosen.toTextObject(sourceLanguage = "fr").sourceLanguage).isEqualTo("es")
        assertThat(StoryTextElement(id = "x").toTextObject(sourceLanguage = "fr").sourceLanguage).isEqualTo("fr")
    }

    @Test
    fun `the frame rides the wire with iOS's encoding and omits its own defaults`() {
        val plain = StoryTextElement(id = "x").toTextObject("fr")
        assertThat(plain.frameShape).isNull()
        assertThat(plain.framePaddingScale).isNull()
        assertThat(plain.frameBorderWidth).isNull()
        assertThat(plain.frameBorderColor).isNull()
        val framed = StoryTextElement(
            id = "x",
            frame = StoryTextFrame(StoryTextFrameShape.SPEECH, paddingScale = 1.5f, borderWidth = 3f, borderColor = "34C759"),
        ).toTextObject("fr")
        assertThat(framed.frameShape).isEqualTo("speech")
        assertThat(framed.framePaddingScale).isEqualTo(1.5)
        assertThat(framed.frameBorderWidth).isEqualTo(3.0)
        assertThat(framed.frameBorderColor).isEqualTo("34C759")
    }
}
