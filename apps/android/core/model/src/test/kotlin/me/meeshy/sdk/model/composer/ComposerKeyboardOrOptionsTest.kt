package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Options
import me.meeshy.sdk.model.composer.ComposerKeyboardOrOptions.Surface
import org.junit.Test

/**
 * L'état de frappe (#13835, maquette du 2026-10-30, état 2) : clavier OU options, jamais les deux (iOS #6156), la barre
 * de style ne bouge pas quand l'un remplace l'autre, et la scène est le plus grand 9:16 ENTIER au-dessus de la barre.
 */
class ComposerKeyboardOrOptionsTest {

    private fun reserve(
        surface: Surface = Surface.Keyboard,
        ime: Float = 0f,
        imeTarget: Float = 0f,
        lastKeyboard: Float = 0f,
        windowHeight: Float = 692f,
    ): Float = ComposerKeyboardOrOptions.reserve(surface, ime, imeTarget, lastKeyboard, windowHeight)

    private fun framing(
        frameWidth: Float = 360f,
        frameHeight: Float = 640f,
        windowHeight: Float = 692f,
        reserve: Float = 280f,
    ): ComposerKeyboardOrOptions.SceneBox =
        ComposerKeyboardOrOptions.scene(frameWidth, frameHeight, windowHeight, reserve, barHeight = ComposerKeyboardOrOptions.BAR_HEIGHT)

    @Test
    fun `typing starts on the keyboard`() {
        assertThat(ComposerKeyboardOrOptions.initial).isEqualTo(Surface.Keyboard)
    }

    @Test
    fun `touching an icon replaces the keyboard by its choices`() {
        assertThat(ComposerKeyboardOrOptions.iconTapped(Surface.Keyboard, Options.COLOR)).isEqualTo(Surface.Showing(Options.COLOR))
    }

    @Test
    fun `touching another icon swaps the choices without bringing the keyboard back`() {
        assertThat(ComposerKeyboardOrOptions.iconTapped(Surface.Showing(Options.COLOR), Options.ALIGN))
            .isEqualTo(Surface.Showing(Options.ALIGN))
    }

    @Test
    fun `touching the open icon again gives the keyboard back`() {
        assertThat(ComposerKeyboardOrOptions.iconTapped(Surface.Showing(Options.FONT), Options.FONT)).isEqualTo(Surface.Keyboard)
    }

    @Test
    fun `a keyboard raised again, by touching the text, closes the choices`() {
        assertThat(ComposerKeyboardOrOptions.keyboardRaised(Surface.Showing(Options.BACKING))).isEqualTo(Surface.Keyboard)
    }

    @Test
    fun `each icon shows only its own choices, and together they keep every text setting`() {
        assertThat(ComposerKeyboardOrOptions.tools(Options.FONT))
            .containsExactly(TextEditTool.STYLE, TextEditTool.EFFECT, TextEditTool.LANGUAGE).inOrder()
        assertThat(ComposerKeyboardOrOptions.tools(Options.COLOR)).containsExactly(TextEditTool.COLOR, TextEditTool.BORDER).inOrder()
        assertThat(ComposerKeyboardOrOptions.tools(Options.ALIGN)).containsExactly(TextEditTool.ALIGN)
        assertThat(ComposerKeyboardOrOptions.tools(Options.BACKING)).containsExactly(TextEditTool.BACKGROUND, TextEditTool.FRAME).inOrder()
        assertThat(Options.entries.flatMap(ComposerKeyboardOrOptions::tools)).containsExactlyElementsIn(TextEditTool.all)
    }

    @Test
    fun `the bar follows the keyboard while it is the keyboard that shows`() {
        assertThat(reserve(ime = 120f, imeTarget = 280f)).isEqualTo(120f)
        assertThat(reserve(ime = 280f, imeTarget = 280f)).isEqualTo(280f)
    }

    @Test
    fun `the choices take the height of the last keyboard, so the bar does not move while the keyboard goes down`() {
        val showing = Surface.Showing(Options.COLOR)
        assertThat(reserve(surface = showing, ime = 200f, imeTarget = 0f, lastKeyboard = 280f)).isEqualTo(280f)
        assertThat(reserve(surface = showing, ime = 0f, imeTarget = 0f, lastKeyboard = 280f)).isEqualTo(280f)
    }

    @Test
    fun `the keyboard coming back up behind the choices does not move the bar either`() {
        assertThat(reserve(ime = 40f, imeTarget = 280f, lastKeyboard = 280f)).isEqualTo(280f)
    }

    @Test
    fun `a keyboard put away by the system frees its room`() {
        assertThat(reserve(ime = 100f, imeTarget = 0f, lastKeyboard = 280f)).isEqualTo(100f)
    }

    @Test
    fun `with no keyboard ever measured the choices take a bounded default height`() {
        val showing = Surface.Showing(Options.ALIGN)
        assertThat(reserve(surface = showing)).isEqualTo(ComposerKeyboardOrOptions.DEFAULT_OPTIONS_HEIGHT)
        assertThat(reserve(surface = showing, windowHeight = 400f)).isEqualTo(400f * ComposerKeyboardOrOptions.MAX_OPTIONS_FRACTION)
    }

    @Test
    fun `the last keyboard is remembered only once it has settled`() {
        assertThat(ComposerKeyboardOrOptions.rememberedKeyboard(previous = 0f, ime = 150f, imeTarget = 280f)).isEqualTo(0f)
        assertThat(ComposerKeyboardOrOptions.rememberedKeyboard(previous = 0f, ime = 280f, imeTarget = 280f)).isEqualTo(280f)
        assertThat(ComposerKeyboardOrOptions.rememberedKeyboard(previous = 280f, ime = 0f, imeTarget = 0f)).isEqualTo(280f)
    }

    @Test
    fun `on the S8 with a keyboard up the scene is the largest whole 9 by 16 above the bar, centred`() {
        val box = framing()

        val barTop = 692f - 280f - ComposerKeyboardOrOptions.BAR_HEIGHT
        assertThat(box.bottom).isAtMost(barTop)
        assertThat(box.top).isAtLeast(0f)
        assertThat(box.bottom - box.top).isWithin(0.5f).of(barTop - ComposerKeyboardOrOptions.SCENE_MARGIN * 2f)
        assertThat(box.width / box.height).isWithin(0.001f).of(9f / 16f)
        assertThat(box.left + box.width / 2f).isWithin(0.5f).of(180f)
    }

    @Test
    fun `the scene is only ever scaled down, never past its rest size`() {
        val box = framing(reserve = 0f, windowHeight = 2000f)

        assertThat(box.framing.scale).isEqualTo(1f)
    }

    @Test
    fun `a wide window keeps the scene whole and limited by the height left`() {
        val box = framing(frameWidth = 423f, frameHeight = 752f, windowHeight = 752f, reserve = 330f)

        assertThat(box.bottom).isAtMost(752f - 330f - ComposerKeyboardOrOptions.BAR_HEIGHT)
        assertThat(box.width / box.height).isWithin(0.001f).of(9f / 16f)
    }
}
