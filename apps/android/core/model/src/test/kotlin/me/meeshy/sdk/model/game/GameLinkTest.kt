package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.deeplink.GameLink
import org.junit.Test

class GameLinkTest {

    @Test
    fun `les deux schemas lisent la saison et la semaine`() {
        assertThat(GameLinks.parse("https://meeshy.me/me/progression/saison/3")).isEqualTo(GameLink.Season(3))
        assertThat(GameLinks.parse("meeshy://me/progression/saison/3")).isEqualTo(GameLink.Season(3))
        assertThat(GameLinks.parse("https://meeshy.me/me/progression/ligue/2026-10-12")).isEqualTo(GameLink.LeagueWeek("2026-10-12"))
        assertThat(GameLinks.parse("meeshy://me/progression/ligue/2026-10-12")).isEqualTo(GameLink.LeagueWeek("2026-10-12"))
    }

    @Test
    fun `la forme nue ouvre l en cours`() {
        assertThat(GameLinks.parse("https://meeshy.me/me/progression/saison")).isEqualTo(GameLink.Season(null))
        assertThat(GameLinks.parse("meeshy://me/progression/ligue")).isEqualTo(GameLink.LeagueWeek(null))
    }

    @Test
    fun `un parametre invalide ouvre l en cours`() {
        listOf("0", "10000", "-1", "01", "abc").forEach {
            assertThat(GameLinks.parse("https://meeshy.me/me/progression/saison/$it")).isEqualTo(GameLink.Season(null))
        }
        listOf("2026-10-13", "2026-02-30", "lundi").forEach {
            assertThat(GameLinks.parse("https://meeshy.me/me/progression/ligue/$it")).isEqualTo(GameLink.LeagueWeek(null))
        }
        assertThat(GameLinks.parse("https://meeshy.me/me/progression/saison/9999")).isEqualTo(GameLink.Season(9999))
    }

    @Test
    fun `une adresse hors du jeu n est pas un lien du jeu`() {
        assertThat(GameLinks.parse("https://example.com/me/progression/saison/3")).isNull()
        assertThat(GameLinks.parse("https://meeshy.me/me/profil")).isNull()
        assertThat(GameLinks.parse("ftp://meeshy.me/me/progression/saison/3")).isNull()
        assertThat(GameLinks.parse("saison")).isNull()
    }

    @Test
    fun `la requete et l ancre sont ignorees`() {
        assertThat(GameLinks.parse("https://meeshy.me/me/progression/saison/5?x=1#top")).isEqualTo(GameLink.Season(5))
    }

    @Test
    fun `l adresse canonique relit le lien`() {
        listOf(GameLink.Season(7), GameLink.Season(null), GameLink.LeagueWeek("2026-10-19"), GameLink.LeagueWeek(null)).forEach {
            assertThat(GameLinks.parse(GameLinks.url("https://meeshy.me/", it))).isEqualTo(it)
        }
    }
}
