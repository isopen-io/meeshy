package me.meeshy.sdk.model.format

import com.google.common.truth.Truth.assertThat
import java.util.Locale
import org.junit.Test

class CompactCountFormatTest {
    private fun text(count: Int, tag: String) = CompactCountFormat.text(count, Locale.forLanguageTag(tag))

    @Test fun `sous mille le nombre est tel quel`() {
        assertThat(text(999, "en")).isEqualTo("999")
        assertThat(text(0, "fr")).isEqualTo("0")
    }

    @Test fun `fr virgule et espace insecable`() {
        assertThat(text(1_500, "fr")).isEqualTo("1,5 k")
        assertThat(text(2_300_000, "fr")).isEqualTo("2,3 M")
    }

    @Test fun `en point et suffixe colle`() {
        assertThat(text(1_500, "en")).isEqualTo("1.5K")
        assertThat(text(2_300_000, "en-US")).isEqualTo("2.3M")
    }

    @Test fun `es et pt disent mil`() {
        assertThat(text(1_500, "es")).isEqualTo("1,5 mil")
        assertThat(text(1_500, "pt-BR")).isEqualTo("1,5 mil")
        assertThat(CompactCountFormat.text(1_500_000_000L, Locale.forLanguageTag("es"))).isEqualTo("1500 M")
    }

    @Test fun `de et it n abregent pas les milliers`() {
        assertThat(text(1_500, "de")).isEqualTo("1.500")
        assertThat(text(1_500_000, "de")).isEqualTo("1,5 Mio.")
        assertThat(text(1_500_000, "it")).isEqualTo("1,5 Mln")
    }

    @Test fun `ar chiffres natifs`() {
        assertThat(text(1_500, "ar")).isEqualTo("١٫٥ ألف")
        assertThat(text(12, "ar")).isEqualTo("١٢")
    }

    @Test fun `mille donne 1 k jamais 1 0k`() {
        assertThat(text(1_000, "fr")).isEqualTo("1 k")
        assertThat(text(1_000, "en")).isEqualTo("1K")
    }

    @Test fun `au dela de dix unites on tronque la decimale`() {
        assertThat(text(12_345, "en")).isEqualTo("12K")
        assertThat(text(9_949, "en")).isEqualTo("9.9K")
    }

    @Test fun `bornes de bascule 999 950`() {
        assertThat(text(999_499, "en")).isEqualTo("999K")
        assertThat(text(999_950, "en")).isEqualTo("1M")
        assertThat(text(999_949_999, "en")).isEqualTo("1B")
    }

    @Test fun `negatifs et non finis bornes a zero`() {
        assertThat(text(-5, "en")).isEqualTo("0")
        assertThat(CompactCountFormat.text(Double.NaN, Locale.ENGLISH)).isEqualTo("0")
        assertThat(CompactCountFormat.text(Double.POSITIVE_INFINITY, Locale.ENGLISH)).isEqualTo("0")
    }

    @Test fun `la precision du jeu garde une decimale a tous les paliers`() {
        val en = Locale.forLanguageTag("en")
        assertThat(text(12_340, "en")).isEqualTo("12K")
        assertThat(CompactCountFormat.text(12_340, en, CompactPrecision.UP_TO_ONE_DECIMAL)).isEqualTo("12.3K")
        assertThat(CompactCountFormat.text(10_000, en, CompactPrecision.UP_TO_ONE_DECIMAL)).isEqualTo("10K")
        assertThat(CompactCountFormat.text(999_999, en, CompactPrecision.UP_TO_ONE_DECIMAL)).isEqualTo("1M")
    }

    @Test fun `langue inconnue retombe sur l anglais`() {
        assertThat(text(1_500, "ja")).isEqualTo("1.5K")
    }
}
