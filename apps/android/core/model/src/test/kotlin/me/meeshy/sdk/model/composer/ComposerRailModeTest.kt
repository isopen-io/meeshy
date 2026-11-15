package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerRailModeTest {
    private val doors = listOf(ComposerRailDoor.MEDIA, ComposerRailDoor.TEXT)
    private val drawing = listOf(ComposerToolControl("drawing.color", false), ComposerToolControl("drawing.width", true))
    private val text = listOf(ComposerToolControl("text.style", false))

    @Test
    fun `without any tool the rail shows the doors`() {
        val mode = ComposerRailMode.resolve(drawingControls = null, textControls = null, doors = doors)
        assertThat(mode).isEqualTo(ComposerRailMode.Doors(doors))
        assertThat(mode.opensTool).isFalse()
    }

    @Test
    fun `an open tool replaces the doors by its controllers`() {
        val mode = ComposerRailMode.resolve(drawingControls = null, textControls = text, doors = doors)
        assertThat(mode).isEqualTo(ComposerRailMode.Tool(text))
        assertThat(mode.opensTool).isTrue()
    }

    @Test
    fun `drawing wins over text editing`() {
        assertThat(ComposerRailMode.resolve(drawing, text, doors)).isEqualTo(ComposerRailMode.Tool(drawing))
    }

    @Test
    fun `only an open tool shows its controllers and hides the rest of the chrome`() {
        ComposerToolFocus.Chrome.entries.forEach { chrome ->
            val shownWhenOpen = ComposerToolFocus.isShown(chrome, toolIsOpen = true)
            val shownWhenClosed = ComposerToolFocus.isShown(chrome, toolIsOpen = false)
            when (chrome) {
                ComposerToolFocus.Chrome.TOOL_CONTROLS -> { assertThat(shownWhenOpen).isTrue(); assertThat(shownWhenClosed).isFalse() }
                ComposerToolFocus.Chrome.TRAILING_RAIL -> { assertThat(shownWhenOpen).isTrue(); assertThat(shownWhenClosed).isTrue() }
                else -> { assertThat(shownWhenOpen).isFalse(); assertThat(shownWhenClosed).isTrue() }
            }
        }
    }

    @Test
    fun `an inline edit counts as an open tool`() {
        assertThat(ComposerToolFocus.toolIsOpen(railOpensTool = false, editsInline = true)).isTrue()
        assertThat(ComposerToolFocus.toolIsOpen(railOpensTool = false, editsInline = false)).isFalse()
    }

    @Test
    fun `writing text clears the doors, the trailing rail and the socle`() {
        listOf(ComposerToolFocus.Chrome.SCENE_DOORS, ComposerToolFocus.Chrome.TRAILING_RAIL, ComposerToolFocus.Chrome.SOCLE).forEach {
            assertThat(ComposerToolFocus.isShown(it, toolIsOpen = false, writing = ComposerWriting.SCENE_LEGEND)).isFalse()
        }
        assertThat(ComposerToolFocus.isShown(ComposerToolFocus.Chrome.DESCRIPTION, toolIsOpen = false, writing = ComposerWriting.SCENE_LEGEND)).isTrue()
    }

    @Test
    fun `the post body hides the description zone it replaces`() {
        assertThat(ComposerToolFocus.isShown(ComposerToolFocus.Chrome.DESCRIPTION, toolIsOpen = false, writing = ComposerWriting.POST_BODY)).isFalse()
    }

    @Test
    fun `writing resolves from what is edited and the post body wins`() {
        assertThat(ComposerWriting.resolve(editsSceneDescription = false, editsPostContent = false)).isEqualTo(ComposerWriting.NOTHING)
        assertThat(ComposerWriting.resolve(editsSceneDescription = true, editsPostContent = false)).isEqualTo(ComposerWriting.SCENE_LEGEND)
        assertThat(ComposerWriting.resolve(editsSceneDescription = true, editsPostContent = true)).isEqualTo(ComposerWriting.POST_BODY)
        assertThat(ComposerWriting.NOTHING.writesText).isFalse()
        assertThat(ComposerWriting.POST_BODY.writesText).isTrue()
    }
}
