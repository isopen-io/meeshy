package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DisplayNameTruncatedTest {
    @Test fun `un nom court reste intact`() {
        assertThat(DisplayName.truncated("Jean")).isEqualTo("Jean")
        assertThat(DisplayName.truncated("a".repeat(16))).isEqualTo("a".repeat(16))
    }

    @Test fun `au dela de seize graphemes on coupe avec une ellipse`() {
        assertThat(DisplayName.truncated("a".repeat(20))).isEqualTo("a".repeat(16) + "…")
    }

    @Test fun `les espaces de fin sont retires avant l ellipse`() {
        assertThat(DisplayName.truncated("Jean Baptiste Poquelin")).isEqualTo("Jean Baptiste Po\u2026")
        assertThat(DisplayName.truncated("Jean Baptiste   Poquelin", limit = 14)).isEqualTo("Jean Baptiste…")
    }

    @Test fun `un emoji compose compte pour un seul grapheme`() {
        val family = "👩‍👩‍👧"
        val name = family.repeat(17)
        assertThat(DisplayName.truncated(name)).isEqualTo(family.repeat(16) + "…")
        assertThat(DisplayName.truncated(family.repeat(16))).isEqualTo(family.repeat(16))
    }

    @Test fun `un accent combinant et un drapeau restent entiers`() {
        val accent = "é"
        assertThat(DisplayName.truncated(accent.repeat(17))).isEqualTo(accent.repeat(16) + "…")
        val flag = "🇫🇷"
        assertThat(DisplayName.truncated(flag.repeat(17))).isEqualTo(flag.repeat(16) + "…")
    }

    @Test fun `limite nulle donne vide`() {
        assertThat(DisplayName.truncated("abc", limit = 0)).isEmpty()
    }
}
