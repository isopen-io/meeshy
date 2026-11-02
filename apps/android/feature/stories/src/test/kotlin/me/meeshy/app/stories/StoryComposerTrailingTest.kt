package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerObjectEditorRail
import me.meeshy.sdk.model.composer.ComposerObjectEditorSection
import me.meeshy.sdk.model.composer.ComposerObjectKind
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Entry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Focus
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import me.meeshy.sdk.model.composer.MediaEditTool
import me.meeshy.sdk.model.composer.TextEditTool
import org.junit.Test

class StoryComposerTrailingTest {
    private fun withText(): StoryComposerUiState = StoryComposerTextReducer.added(StoryComposerUiState(), "t1")
    private fun withSticker(): StoryComposerUiState = StoryComposerStickerReducer.added(StoryComposerUiState(), "😀", "s1")

    @Test
    fun `nothing touched and no tool open is the scene`() {
        assertThat(StoryComposerUiState().trailingFocus).isEqualTo(Focus.Scene())
    }

    @Test
    fun `the brush is a tool whose controllers are colour and thickness, the unfolded one marked`() {
        val focus = StoryComposerDrawingReducer.entered(StoryComposerUiState()).trailingFocus as Focus.Tool
        assertThat(focus.controls.map { it.id }).containsExactly("drawing.color", "drawing.width").inOrder()
        assertThat(focus.controls.map { it.isExpanded }).containsExactly(true, false).inOrder()
    }

    @Test
    fun `a selected text serves its sections then its actions, the first section open by default`() {
        val focus = withText().trailingFocus as Focus.Object
        assertThat(focus.sections).isEqualTo(ServedTextSections)
        assertThat(focus.open).isEqualTo(ComposerObjectEditorSection.Tool(TextEditTool.STYLE))
        assertThat(focus.actions).contains(Action.DELETE)
    }

    @Test
    fun `touching a section opens it and a section nobody serves is ignored`() {
        val color = ComposerObjectEditorSection.Tool(TextEditTool.COLOR)
        val opened = StoryComposerTrailingReducer.sectionOpened(withText(), color)
        assertThat((opened.trailingFocus as Focus.Object).open).isEqualTo(color)
        val ignored = StoryComposerTrailingReducer.sectionOpened(withText(), ComposerObjectEditorSection.Media(MediaEditTool.TRIM))
        assertThat(ignored.openObjectSection).isNull()
    }

    @Test
    fun `a sticker serves time then plan, as the iOS rail of its family, the first open by default`() {
        val focus = withSticker().trailingFocus as Focus.Object
        assertThat(focus.sections).isEqualTo(ComposerObjectEditorRail.entries(ComposerObjectKind.STICKER))
        assertThat(focus.sections).containsExactly(ComposerObjectEditorSection.Timing, ComposerObjectEditorSection.Plan).inOrder()
        assertThat(focus.open).isEqualTo(ComposerObjectEditorSection.Timing)
        val entries = me.meeshy.sdk.model.composer.ComposerTrailingColumn.options(focus)
        assertThat(entries.last()).isEqualTo(Entry.ExitObject)
        assertThat(entries.filterIsInstance<Entry.EditorSection>()).hasSize(2)
    }

    @Test
    fun `a sticker opens its plan, and ignores a text tool it does not serve`() {
        val plan = StoryComposerTrailingReducer.sectionOpened(withSticker(), ComposerObjectEditorSection.Plan)
        assertThat((plan.trailingFocus as Focus.Object).open).isEqualTo(ComposerObjectEditorSection.Plan)
        val ignored = StoryComposerTrailingReducer.sectionOpened(withSticker(), ComposerObjectEditorSection.Tool(TextEditTool.COLOR))
        assertThat((ignored.trailingFocus as Focus.Object).open).isEqualTo(ComposerObjectEditorSection.Timing)
    }

    @Test
    fun `a text section left open does not leak onto the next sticker`() {
        val color = StoryComposerTrailingReducer.sectionOpened(withText(), ComposerObjectEditorSection.Tool(TextEditTool.COLOR))
        val onSticker = StoryComposerStickerReducer.added(color, "😀", "s2")
        assertThat((onSticker.trailingFocus as Focus.Object).open).isEqualTo(ComposerObjectEditorSection.Timing)
    }

    @Test
    fun `the sticker window cycles like a text window, on the sticker alone`() {
        val state = withSticker()
        val started = StoryComposerStickerReducer.startCycled(state, "s1")
        assertThat(started.selectedSticker!!.timing).isNotEqualTo(state.selectedSticker!!.timing)
        val timed = StoryComposerStickerReducer.durationCycled(state, "s1")
        assertThat(timed.selectedSticker!!.timing.isTimed).isTrue()
        assertThat(StoryComposerStickerReducer.startCycled(state, "absent")).isEqualTo(state)
    }

    @Test
    fun `a sticker window set from its time section is published under the iOS keys`() {
        val timed = StoryComposerStickerReducer.durationCycled(StoryComposerStickerReducer.startCycled(withSticker(), "s1"), "s1")
        val timing = timed.selectedSticker!!.timing
        val wire = timed.selectedSticker!!.toSticker()
        assertThat(wire.startTime).isEqualTo(timing.startSeconds.toDouble())
        assertThat(wire.duration).isEqualTo(timing.durationSeconds.toDouble())
        assertThat(withSticker().selectedSticker!!.toSticker().startTime).isNull()
    }

    @Test
    fun `a text serves iOS's eight tools then time then plan, in that order`() {
        assertThat(ServedTextSections).isEqualTo(
            ComposerObjectEditorRail.entries(ComposerObjectKind.TEXT),
        )
    }

    @Test
    fun `every served section sits in the iOS rail and none repeats an action of the column`() {
        val actions = (StoryComposerTextReducer.added(withText(), "t2").trailingFocus as Focus.Object).actions
        assertThat(ServedTextSections.filterIsInstance<ComposerObjectEditorSection.Media>()).isEmpty()
        assertThat(ServedTextSections).containsNoDuplicates()
        // le plan est la frise des pistes ; aucun empilement, toucher l'objet le fait passer devant (#13917)
        assertThat(actions).containsAtLeast(Action.DUPLICATE, Action.DELETE)
    }

    @Test
    fun `frame, border, language and plan are all openable`() {
        listOf(TextEditTool.FRAME, TextEditTool.BORDER, TextEditTool.LANGUAGE).forEach { tool ->
            val section = ComposerObjectEditorSection.Tool(tool)
            val opened = StoryComposerTrailingReducer.sectionOpened(withText(), section)
            assertThat((opened.trailingFocus as Focus.Object).open).isEqualTo(section)
        }
        val plan = StoryComposerTrailingReducer.sectionOpened(withText(), ComposerObjectEditorSection.Plan)
        assertThat((plan.trailingFocus as Focus.Object).open).isEqualTo(ComposerObjectEditorSection.Plan)
    }

    @Test
    fun `time is served only by an animated scene`() {
        assertThat(StoryComposerUiState().timeServed).isFalse()
        assertThat(StoryComposerUiState(sceneIsAnimated = true).timeServed).isTrue()
    }

    @Test
    fun `an animated scene with a tool open keeps the history but not the time button`() {
        val state = StoryComposerDrawingReducer.entered(StoryComposerUiState(sceneIsAnimated = true))
        val foot = me.meeshy.sdk.model.composer.ComposerTrailingColumn.foot(state.trailingFocus, state.timeServed)
        assertThat(foot).doesNotContain(me.meeshy.sdk.model.composer.ComposerTrailingColumn.Foot.TIME)
    }

    private fun text(state: StoryComposerUiState) = state.deck.selectedSlide.elements.first { it.id == "t1" }

    @Test
    fun `opening the frame section on a neutral text shows the box at once, like iOS onAppear`() {
        val opened = StoryComposerTrailingReducer.sectionOpened(withText(), ComposerObjectEditorSection.Tool(TextEditTool.FRAME))
        assertThat(text(opened).frame.borderWidth).isEqualTo(2f)
        assertThat(text(opened).frame.borderColor).isEqualTo("FFFFFF")
    }

    @Test
    fun `opening the border section on a never-outlined text strokes it white at four`() {
        val opened = StoryComposerTrailingReducer.sectionOpened(withText(), ComposerObjectEditorSection.Tool(TextEditTool.BORDER))
        assertThat(text(opened).outline.width).isEqualTo(4f)
        assertThat(text(opened).outline.color).isEqualTo("FFFFFF")
    }

    @Test
    fun `opening any other section leaves the text untouched`() {
        val base = withText()
        val opened = StoryComposerTrailingReducer.sectionOpened(base, ComposerObjectEditorSection.Tool(TextEditTool.COLOR))
        assertThat(opened.deck).isEqualTo(base.deck)
    }

    @Test
    fun `the text palette is iOS StoryTextColors palette, in its order`() {
        assertThat(STORY_TEXT_COLORS).containsExactly(
            "FFFFFF", "000000", "FF2E63", "08D9D6", "F8B500",
            "9B59B6", "2ECC71", "FF6B6B", "3498DB", "E91E63",
            "FF7F50", "00CED1", "A855F7", "F59E0B",
        ).inOrder()
    }
}
