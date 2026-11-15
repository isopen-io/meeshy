package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

class LanguageShareLegendTest {
    @Test
    fun `parts mesurees - autonyme et pourcentage arrondi separes`() {
        val shares = InviteLanguageShare.weighted(listOf("fr" to 2, "ko" to 1))
        val legend = LanguageShareLegend.from(shares, Locale.FRANCE)
        assertThat(legend.entries.map { it.name }).containsExactly("Français", "한국어").inOrder()
        assertThat(legend.entries.map { it.percentLabel!!.filter(Char::isDigit) }).containsExactly("67", "33").inOrder()
    }

    @Test
    fun `parts egales - aucun pourcentage affirme`() {
        val legend = LanguageShareLegend.from(InviteLanguageShare.even(listOf("fr", "en", "es", "de")), Locale.US)
        assertThat(legend.entries.all { it.percentLabel == null }).isTrue()
        assertThat(legend.accessibilitySummary).isEqualTo("Français, English, Español, Deutsch")
    }

    @Test
    fun `plus de six langues - cinq plus un reste regroupe`() {
        val shares = InviteLanguageShare.even(listOf("fr", "en", "es", "de", "it", "pt", "ko"))
        val legend = LanguageShareLegend.from(shares, Locale.US)
        assertThat(legend.entries).hasSize(6)
        assertThat(legend.entries.last().name).isEqualTo("…")
        assertThat(legend.entries.last().colorHex).isNull()
    }

    @Test
    fun `le resume dit le nom puis le pourcentage de chaque segment`() {
        val shares = InviteLanguageShare.weighted(listOf("en" to 1))
        assertThat(LanguageShareLegend.from(shares, Locale.US).accessibilitySummary).isEqualTo("English 100%")
    }
}
