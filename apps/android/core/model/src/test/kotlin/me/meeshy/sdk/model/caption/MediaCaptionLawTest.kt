package me.meeshy.sdk.model.caption

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MediaCaptionLawTest {
    private fun words(count: Int) = (1..count).joinToString(" ") { "m$it" }

    @Test
    fun `une legende de trente mots sort entiere`() {
        val folded = MediaCaptionLaw.collapse(words(30))
        assertThat(folded.isTruncated).isFalse()
        assertThat(folded.head).isEqualTo(words(30))
    }

    @Test
    fun `au trente et unieme mot la legende se replie sur les quinze premiers`() {
        val folded = MediaCaptionLaw.collapse(words(31))
        assertThat(folded.isTruncated).isTrue()
        assertThat(folded.head).isEqualTo(words(15))
    }

    @Test
    fun `une legende de seize a trente mots n est pas repliee`() {
        assertThat(MediaCaptionLaw.collapse(words(20)).isTruncated).isFalse()
    }

    @Test
    fun `un texte sans blanc compte un seul mot et sort entier`() {
        val folded = MediaCaptionLaw.collapse("日本語".repeat(200))
        assertThat(folded.isTruncated).isFalse()
    }

    @Test
    fun `les sauts de ligne comptent comme des blancs`() {
        val folded = MediaCaptionLaw.collapse((1..31).joinToString("\n") { "m$it" })
        assertThat(folded.isTruncated).isTrue()
        assertThat(folded.head.split(" ")).hasSize(15)
    }

    @Test
    fun `le repli se decide sans etat porte par le texte replie`() {
        assertThat(MediaCaptionLaw.shown(words(40), expanded = true)).isEqualTo(words(40))
        assertThat(MediaCaptionLaw.shown(words(40), expanded = false)).isEqualTo(words(15) + "…")
        assertThat(MediaCaptionLaw.shown(words(5), expanded = false)).isEqualTo(words(5))
    }
}
