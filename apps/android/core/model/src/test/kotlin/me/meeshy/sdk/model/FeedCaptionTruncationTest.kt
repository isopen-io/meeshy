package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class FeedCaptionTruncationTest {

    private fun words(count: Int) = (1..count).joinToString(" ") { "m$it" }

    @Test
    fun `une legende de vingt mots sort entiere sans ellipse`() {
        assertThat(FeedCaptionAbridger.abridged(words(20))).isEqualTo(words(20))
        assertThat(FeedCaptionAbridger.isTruncated(words(20))).isFalse()
    }

    @Test
    fun `une legende de vingt et un mots garde vingt mots et une ellipse`() {
        val shown = FeedCaptionAbridger.abridged(words(21))
        assertThat(shown).isEqualTo(words(20) + "…")
        assertThat(FeedCaptionAbridger.isTruncated(words(21))).isTrue()
    }

    @Test
    fun `le texte entier reste disponible pour Developper`() {
        assertThat(FeedCaptionAbridger.full("  " + words(40) + "\n")).isEqualTo(words(40))
    }

    @Test
    fun `une legende blanche ne montre rien et n'est pas tronquee`() {
        assertThat(FeedCaptionAbridger.abridged("   \n ")).isNull()
        assertThat(FeedCaptionAbridger.isTruncated("   ")).isFalse()
    }

    @Test
    fun `une troncature en mots ne depend pas des blancs de bord`() {
        assertThat(FeedCaptionAbridger.isTruncated("  " + words(20) + "  ")).isFalse()
    }

    @Test
    fun `un texte sans blanc compte un mot et sort entier`() {
        val cjk = "这是一个没有空格的很长的句子".repeat(10)
        assertThat(FeedCaptionAbridger.abridged(cjk)).isEqualTo(cjk)
    }

    @Test
    fun `une mosaique demande moins de mots que le fil`() {
        assertThat(FeedCaptionAbridger.abridged(words(10), words = 5)).isEqualTo(words(5) + "…")
    }

    @Test
    fun `la page d'un carrousel reste dans les bornes quand un media disparait`() {
        assertThat(FeedCarouselPaging.page(index = 2, count = 2)).isEqualTo(1)
        assertThat(FeedCarouselPaging.page(index = -3, count = 4)).isEqualTo(0)
        assertThat(FeedCarouselPaging.page(index = 5, count = 0)).isEqualTo(0)
        assertThat(FeedCarouselPaging.page(index = 1, count = 3)).isEqualTo(1)
    }
}
