package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PostTextTruncationTest {
    private fun words(count: Int) = (1..count).joinToString(" ") { "m$it" }

    @Test
    fun `un texte de vingt mots ou moins reste entier`() {
        val cut = PostTextTruncation.cut(words(20))
        assertThat(cut.isTruncated).isFalse()
        assertThat(cut.text).isEqualTo(words(20))
    }

    @Test
    fun `au vingt et unieme mot le texte est coupe apres le vingtieme`() {
        val cut = PostTextTruncation.cut(words(21))
        assertThat(cut.isTruncated).isTrue()
        assertThat(cut.text).isEqualTo(words(20))
    }

    @Test
    fun `la coupe garde les sauts de ligne internes`() {
        val cut = PostTextTruncation.cut("a b\nc d e f", maxWords = 4)
        assertThat(cut.text).isEqualTo("a b\nc d")
        assertThat(cut.isTruncated).isTrue()
    }

    @Test
    fun `un texte unicode et des emoji comptent des mots separes par blanc`() {
        val cut = PostTextTruncation.cut("héllo 😀 日本語 👨‍👩‍👧 fin", maxWords = 4)
        assertThat(cut.text).isEqualTo("héllo 😀 日本語 👨‍👩‍👧")
        assertThat(cut.isTruncated).isTrue()
    }

    @Test
    fun `un texte vide ou blanc n est pas tronque`() {
        assertThat(PostTextTruncation.cut("").isTruncated).isFalse()
        assertThat(PostTextTruncation.cut("   ").isTruncated).isFalse()
    }

    @Test
    fun `une limite nulle ou negative ne coupe rien`() {
        assertThat(PostTextTruncation.cut(words(50), maxWords = 0).isTruncated).isFalse()
    }
}
