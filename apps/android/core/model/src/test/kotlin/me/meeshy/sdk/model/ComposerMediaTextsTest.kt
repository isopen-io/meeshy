package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ComposerMediaTextsTest {
    @Test
    fun `nothing typed gives a null payload never an empty map`() {
        assertThat(ComposerMediaTexts.NONE.payload(PostMediaText.ALT)).isNull()
        assertThat(ComposerMediaTexts(alt = mapOf("a" to "  ")).payload(PostMediaText.ALT)).isNull()
        assertThat(ComposerMediaTexts.NONE.isEmpty).isTrue()
    }

    @Test
    fun `alt and caption are routed apart`() {
        val texts = ComposerMediaTexts(alt = mapOf("m1" to "un chat"), caption = mapOf("m1" to "Noël"))
        assertThat(texts.payload(PostMediaText.ALT)).containsExactly("m1", "un chat")
        assertThat(texts.payload(PostMediaText.CAPTION)).containsExactly("m1", "Noël")
    }

    @Test
    fun `each text is capped at 1000 characters`() {
        val long = "x".repeat(1500)
        val texts = ComposerMediaTexts(alt = mapOf("m" to long), caption = mapOf("m" to long))
        assertThat(texts.payload(PostMediaText.ALT)!!["m"]).hasLength(1000)
        assertThat(texts.payload(PostMediaText.CAPTION)!!["m"]).hasLength(1000)
        assertThat(ComposerMediaTexts(alt = mapOf("m" to "x".repeat(1000))).payload(PostMediaText.ALT)!!["m"]).hasLength(1000)
    }

    @Test
    fun `blank entries are dropped while others stay`() {
        val texts = ComposerMediaTexts(caption = mapOf("a" to "", "b" to "ok"))
        assertThat(texts.payload(PostMediaText.CAPTION)).containsExactly("b", "ok")
    }
}
