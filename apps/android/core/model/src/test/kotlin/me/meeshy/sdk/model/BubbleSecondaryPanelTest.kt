package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleSecondaryPanelTest {

    private val texts = mapOf("es" to "Hola", "de" to "  ")

    @Test
    fun `no panel when none is open`() {
        assertThat(BubbleSecondaryPanel.of(null, "fr", texts)).isNull()
    }

    @Test
    fun `an open language carries its text and the colour of its language`() {
        val panel = BubbleSecondaryPanel.of("es", "fr", texts)!!
        assertThat(panel.text).isEqualTo("Hola")
        assertThat(panel.colorHex).isEqualTo(LanguageData.info("es")!!.colorHex)
        assertThat(panel.flag).isEqualTo(LanguageData.info("es")!!.flag)
    }

    @Test
    fun `no panel when the language has no text`() {
        assertThat(BubbleSecondaryPanel.of("de", "fr", texts)).isNull()
        assertThat(BubbleSecondaryPanel.of("it", "fr", texts)).isNull()
    }

    @Test
    fun `no panel when the language is already the primary text`() {
        assertThat(BubbleSecondaryPanel.of("es", "ES", texts)).isNull()
    }

    @Test
    fun `the separator lines are drawn at 0,4`() {
        assertThat(BubbleSecondaryPanel.SEPARATOR_LINE_ALPHA).isEqualTo(0.4f)
    }
}
