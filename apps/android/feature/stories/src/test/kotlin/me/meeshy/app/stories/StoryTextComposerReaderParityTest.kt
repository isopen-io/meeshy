package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Loi 6 — le player est l'aperçu (#12296). Un texte composé sur la scène Android, publié
 * sur le fil puis relu par le lecteur, garde la même taille en pixels pour une même
 * largeur de scène, et la même typographie. Avant, le composer dessinait à 18 sp fixes
 * quelle que soit la scène et le lecteur ignorait le style publié.
 */
@RunWith(JUnit4::class)
class StoryTextComposerReaderParityTest {

    private fun readerViewOf(element: StoryTextElement): StoryTextObjectView =
        StoryTextObjectProjection.project(element.toTextObject("fr"), preferredLanguages = listOf("fr"))

    @Test
    fun `a published text keeps in the reader the pixel size it had on the composer scene`() {
        StoryTextSize.entries.forEach { size ->
            listOf(0.5f, 1f, 2.5f).forEach { scale ->
                val element = StoryTextElement(id = "t", text = "Story", size = size, scale = scale)
                listOf(320f, 720f, 1080f).forEach { canvasWidth ->
                    val composerPx = element.previewFontPx(canvasWidth) * element.scale
                    assertThat(readerViewOf(element).fontPx(canvasWidth)).isWithin(0.01f).of(composerPx)
                }
            }
        }
    }

    @Test
    fun `the text size follows the scene width in the 1080 design referential`() {
        val element = StoryTextElement(id = "t", text = "Story", size = StoryTextSize.MEDIUM)

        assertThat(element.previewFontPx(1080f)).isWithin(0.01f).of(96f)
        assertThat(element.previewFontPx(540f)).isWithin(0.01f).of(48f)
    }

    @Test
    fun `the reader renders the typography of the published style`() {
        StoryTextStyle.entries.forEach { style ->
            val element = StoryTextElement(id = "t", text = "Story", style = style)
            assertThat(readerViewOf(element).style.typography()).isEqualTo(style.typography())
        }
    }

    @Test
    fun `an absent or unknown style reads as bold like iOS parsedTextStyle`() {
        assertThat(StoryTextStyle.fromWire(null)).isEqualTo(StoryTextStyle.BOLD)
        assertThat(StoryTextStyle.fromWire("glitch")).isEqualTo(StoryTextStyle.BOLD)
        assertThat(StoryTextStyle.fromWire("typewriter")).isEqualTo(StoryTextStyle.TYPEWRITER)
    }
}
