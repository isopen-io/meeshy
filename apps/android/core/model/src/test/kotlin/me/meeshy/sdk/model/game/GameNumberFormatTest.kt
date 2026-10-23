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
    fun `compactCount garde le chiffre plein sous dix mille`() {
        assertThat(GameNumberFormat.compactCount(9_999, en)).isEqualTo("9,999")
        assertThat(GameNumberFormat.compactCount(0, fr)).isEqualTo("0")
    }

    @Test
    fun `compactCount ecrit 8,7 k des dix mille en francais`() {
        assertThat(GameNumberFormat.compactCount(8_700, fr)).isEqualTo("8 700")
        assertThat(GameNumberFormat.compactCount(10_000, fr)).isEqualTo("10 k")
        assertThat(GameNumberFormat.compactCount(12_340, fr)).isEqualTo("12,3 k")
        assertThat(GameNumberFormat.compactCount(987_000, fr)).isEqualTo("987 k")
    }

    @Test
    fun `compactCount suit la locale en anglais`() {
        assertThat(GameNumberFormat.compactCount(12_340, en)).isEqualTo("12.3K")
        assertThat(GameNumberFormat.compactCount(2_500_000, en)).isEqualTo("2.5M")
    }

    @Test
    fun `compactCount passe au palier suivant quand l arrondi atteint mille`() {
        assertThat(GameNumberFormat.compactCount(999_999, en)).isEqualTo("1M")
    }

    @Test
    fun `compactCount ecrit des chiffres arabes en arabe`() {
        val text = GameNumberFormat.compactCount(12_340, arabic)
        assertThat(text.none { it in '0'..'9' }).isTrue()
    }
}
