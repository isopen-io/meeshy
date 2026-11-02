package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import java.text.NumberFormat
import java.util.Locale
import org.junit.Test

class GameNumberFormatTest {

    private val fr = Locale.forLanguageTag("fr-FR")
    private val en = Locale.forLanguageTag("en-US")
    private val arabic = Locale.forLanguageTag("ar-EG")

    @Test
    fun `formatCount groupe les milliers selon la locale`() {
        assertThat(GameNumberFormat.formatCount(1_221, fr)).isEqualTo("1 221")
        assertThat(GameNumberFormat.formatCount(1_221, en)).isEqualTo("1,221")
        assertThat(GameNumberFormat.formatCount(7, en)).isEqualTo("7")
    }

    @Test
    fun `formatCount ecrit des chiffres arabes en arabe`() {
        val text = GameNumberFormat.formatCount(1_221, arabic)
        assertThat(text.filter { it.isDigit() }).isNotEmpty()
        assertThat(text.none { it in '0'..'9' }).isTrue()
    }

    @Test
    fun `tightCount garde le chiffre plein sous dix mille`() {
        assertThat(GameNumberFormat.tightCount(9_999, en)).isEqualTo("9,999")
        assertThat(GameNumberFormat.tightCount(0, fr)).isEqualTo("0")
    }

    @Test
    fun `tightCount ecrit 8,7 k des dix mille en francais`() {
        assertThat(GameNumberFormat.tightCount(8_700, fr)).isEqualTo("8 700")
        assertThat(GameNumberFormat.tightCount(10_000, fr)).isEqualTo("10 k")
        assertThat(GameNumberFormat.tightCount(12_340, fr)).isEqualTo("12,3 k")
        assertThat(GameNumberFormat.tightCount(987_000, fr)).isEqualTo("987 k")
    }

    @Test
    fun `tightCount suit la locale en anglais`() {
        assertThat(GameNumberFormat.tightCount(12_340, en)).isEqualTo("12.3K")
        assertThat(GameNumberFormat.tightCount(2_500_000, en)).isEqualTo("2.5M")
    }

    @Test
    fun `tightCount passe au palier suivant quand l arrondi atteint mille`() {
        assertThat(GameNumberFormat.tightCount(999_999, en)).isEqualTo("1M")
    }

    @Test
    fun `tightCount ecrit des chiffres arabes en arabe`() {
        val text = GameNumberFormat.tightCount(12_340, arabic)
        assertThat(text.none { it in '0'..'9' }).isTrue()
    }
}
