package me.meeshy.ui.component

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class LanguageQuickStripTest {

    @Test
    fun `exact code matches`() {
        assertThat(isActiveCode("fr", "fr")).isTrue()
    }

    @Test
    fun `match is case-insensitive`() {
        assertThat(isActiveCode("FR", "fr")).isTrue()
    }

    @Test
    fun `regional variant matches its base`() {
        assertThat(isActiveCode("pt-BR", "pt")).isTrue()
        assertThat(isActiveCode("pt", "pt-BR")).isTrue()
    }

    @Test
    fun `different languages do not match`() {
        assertThat(isActiveCode("fr", "es")).isFalse()
    }

    @Test
    fun `no active language matches nothing`() {
        assertThat(isActiveCode("fr", null)).isFalse()
    }

    @Test
    fun `up to five flags the pill hugs its content`() {
        assertThat(languageStripScrolls(0)).isFalse()
        assertThat(languageStripScrolls(5)).isFalse()
    }

    @Test
    fun `beyond five flags the row scrolls with the plus pinned`() {
        assertThat(languageStripScrolls(6)).isTrue()
    }

    @Test
    fun `the plus tile is the index right after the last flag`() {
        assertThat(plusTileIndex(0)).isEqualTo(0)
        assertThat(plusTileIndex(7)).isEqualTo(7)
    }
}
