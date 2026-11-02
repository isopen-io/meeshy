package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InviteLanguageShareTest {
    @Test
    fun `parts mesurees triees decroissant avec ordre stable aux ex aequo`() {
        val shares = InviteLanguageShare.weighted(listOf("fr" to 1, "es" to 3, "en" to 1, "de" to 0))
        assertThat(shares.map { it.code }).containsExactly("es", "en", "fr").inOrder()
        assertThat(shares.all { it.isMeasured }).isTrue()
        assertThat(shares.sumOf { it.fraction }).isWithin(1e-9).of(1.0)
        assertThat(shares.first().percent).isEqualTo(60)
    }

    @Test
    fun `total nul ne rend rien`() {
        assertThat(InviteLanguageShare.weighted(listOf("fr" to 0))).isEmpty()
    }

    @Test
    fun `liste simple - parts egales non mesurees sans doublon`() {
        val shares = InviteLanguageShare.even(listOf("fr", "en", "fr", "es", "de"))
        assertThat(shares.map { it.code }).containsExactly("fr", "en", "es", "de").inOrder()
        assertThat(shares.none { it.isMeasured }).isTrue()
        assertThat(shares[0].fraction).isEqualTo(0.25)
        assertThat(InviteLanguageShare.even(emptyList())).isEmpty()
    }

    @Test
    fun `six segments au plus et le reste regroupe`() {
        val shares = InviteLanguageShare.weighted(listOf("a" to 8, "b" to 7, "c" to 6, "d" to 5, "e" to 4, "f" to 3, "g" to 2, "h" to 1))
        val visible = InviteLanguageShare.visible(shares)
        assertThat(visible).hasSize(6)
        assertThat(visible.take(5).map { it.code }).containsExactly("a", "b", "c", "d", "e").inOrder()
        assertThat(visible.last().code).isEmpty()
        assertThat(visible.last().fraction).isWithin(1e-9).of(6.0 / 36.0)
        assertThat(visible.last().isMeasured).isTrue()
        assertThat(visible.sumOf { it.fraction }).isWithin(1e-9).of(1.0)
    }

    @Test
    fun `regroupement non mesure si une source ne l'est pas et six pile intact`() {
        val even = InviteLanguageShare.even(listOf("a", "b", "c", "d", "e", "f", "g"))
        assertThat(InviteLanguageShare.visible(even).last().isMeasured).isFalse()
        assertThat(InviteLanguageShare.visible(even.take(6))).hasSize(6)
        assertThat(InviteLanguageShare.visible(even.take(6)).none { it.code.isEmpty() }).isTrue()
    }

    @Test
    fun `apercu public - langues parlees en parts egales`() {
        val info = ShareLinkInfo(id = "1", stats = ShareLinkStats(spokenLanguages = listOf("fr", "en")))
        assertThat(info.spokenLanguageShares.map { it.fraction }).containsExactly(0.5, 0.5)
    }
}
