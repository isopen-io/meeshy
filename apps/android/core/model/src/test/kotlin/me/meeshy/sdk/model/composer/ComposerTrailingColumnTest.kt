package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Entry
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Focus
import me.meeshy.sdk.model.composer.ComposerTrailingColumn.Foot
import me.meeshy.sdk.model.composer.SceneObjectMenu.Action
import org.junit.Test

class ComposerTrailingColumnTest {
    private val style = ComposerObjectEditorSection.Tool(TextEditTool.STYLE)
    private val color = ComposerObjectEditorSection.Tool(TextEditTool.COLOR)
    private val controls = listOf(ComposerToolControl("drawing.color", true), ComposerToolControl("drawing.width", false))

    private fun objectFocus(actions: List<Action>, sections: List<ComposerObjectEditorSection> = listOf(style, color)) =
        Focus.Object(sections, open = style, actions = actions)

    @Test
    fun `an open tool wins over a selection`() {
        assertThat(ComposerTrailingColumn.focus(controls, objectFocus(emptyList()))).isEqualTo(Focus.Tool(controls))
    }

    @Test
    fun `a selection without a tool is the object focus, nothing at all is the scene`() {
        val selection = objectFocus(emptyList())
        assertThat(ComposerTrailingColumn.focus(null, selection)).isEqualTo(selection)
        assertThat(ComposerTrailingColumn.focus(null, null)).isEqualTo(Focus.Scene)
    }

    @Test
    fun `a tool serves its controllers from the top and its exit last`() {
        val options = ComposerTrailingColumn.options(Focus.Tool(controls))
        assertThat(options).containsExactly(Entry.ToolControl(controls[0]), Entry.ToolControl(controls[1]), Entry.ExitTool).inOrder()
        assertThat(options.last().isExit).isTrue()
    }

    @Test
    fun `an object serves edit, then its sections, then its actions, then its exit`() {
        val options = ComposerTrailingColumn.options(objectFocus(listOf(Action.DUPLICATE, Action.EDIT, Action.DELETE)))
        assertThat(options).containsExactly(
            Entry.ObjectAction(Action.EDIT),
            Entry.EditorSection(style, isOpen = true),
            Entry.EditorSection(color, isOpen = false),
            Entry.ObjectAction(Action.DUPLICATE),
            Entry.ObjectAction(Action.DELETE),
            Entry.ExitObject,
        ).inOrder()
    }

    @Test
    fun `the trim door appears once when the editor already serves trimming`() {
        val trim = ComposerObjectEditorSection.Media(MediaEditTool.TRIM)
        val options = ComposerTrailingColumn.options(Focus.Object(listOf(trim), trim, listOf(Action.TRIM, Action.DELETE)))
        assertThat(options.filterIsInstance<Entry.ObjectAction>().map { it.action }).containsExactly(Action.DELETE)
    }

    @Test
    fun `the scene itself serves no option`() {
        assertThat(ComposerTrailingColumn.options(Focus.Scene)).isEmpty()
    }

    @Test
    fun `time shows only on a free, animated scene and history is always there`() {
        assertThat(ComposerTrailingColumn.foot(Focus.Scene, timeServed = true)).containsExactly(Foot.TIME, Foot.UNDO, Foot.REDO).inOrder()
        assertThat(ComposerTrailingColumn.foot(Focus.Scene, timeServed = false)).containsExactly(Foot.UNDO, Foot.REDO).inOrder()
        assertThat(ComposerTrailingColumn.foot(Focus.Tool(controls), timeServed = true)).containsExactly(Foot.UNDO, Foot.REDO).inOrder()
        assertThat(ComposerTrailingColumn.foot(objectFocus(emptyList()), timeServed = true)).containsExactly(Foot.UNDO, Foot.REDO).inOrder()
    }

    @Test
    fun `only an in-place edit makes the foot follow the options`() {
        assertThat(ComposerTrailingColumn.footFollowsOptions(objectFocus(emptyList()))).isTrue()
        assertThat(ComposerTrailingColumn.footFollowsOptions(Focus.Tool(controls))).isFalse()
        assertThat(ComposerTrailingColumn.footFollowsOptions(Focus.Scene)).isFalse()
    }
}
