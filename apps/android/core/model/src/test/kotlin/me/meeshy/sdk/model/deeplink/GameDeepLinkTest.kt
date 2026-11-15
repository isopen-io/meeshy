package me.meeshy.sdk.model.deeplink

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameDeepLinkTest {

    private fun parse(raw: String) = DeepLinkParser.parse(raw, "https://meeshy.me")

    @Test
    fun `universal and custom season links open that season`() {
        assertThat(parse("https://meeshy.me/me/progression/saison/3")).isEqualTo(DeepLinkDestination.Game(GameLink.Season(3)))
        assertThat(parse("meeshy://me/progression/saison/3")).isEqualTo(DeepLinkDestination.Game(GameLink.Season(3)))
    }

    @Test
    fun `universal and custom league links open that week`() {
        assertThat(parse("https://meeshy.me/me/progression/ligue/2026-10-12"))
            .isEqualTo(DeepLinkDestination.Game(GameLink.LeagueWeek("2026-10-12")))
        assertThat(parse("meeshy://me/progression/ligue/2026-10-19"))
            .isEqualTo(DeepLinkDestination.Game(GameLink.LeagueWeek("2026-10-19")))
    }

    @Test
    fun `past current and future seasons all route`() {
        listOf(1, 2, 12, 9999).forEach {
            assertThat(parse("https://meeshy.me/me/progression/saison/$it")).isEqualTo(DeepLinkDestination.Game(GameLink.Season(it)))
        }
    }

    @Test
    fun `bare forms open the current season and week`() {
        assertThat(parse("https://meeshy.me/me/progression/saison")).isEqualTo(DeepLinkDestination.Game(GameLink.Season(null)))
        assertThat(parse("meeshy://me/progression/ligue/")).isEqualTo(DeepLinkDestination.Game(GameLink.LeagueWeek(null)))
    }

    @Test
    fun `invalid season numbers open the current season`() {
        listOf("0", "-1", "abc", "1.5", "01", "10000").forEach {
            assertThat(parse("https://meeshy.me/me/progression/saison/$it")).isEqualTo(DeepLinkDestination.Game(GameLink.Season(null)))
        }
    }

    @Test
    fun `invalid week keys open the current week`() {
        listOf("2026-10-13", "2026-02-30", "semaine", "20261012").forEach {
            assertThat(parse("https://meeshy.me/me/progression/ligue/$it")).isEqualTo(DeepLinkDestination.Game(GameLink.LeagueWeek(null)))
        }
    }

    @Test
    fun `other me paths keep opening the own profile`() {
        assertThat(parse("https://meeshy.me/me")).isEqualTo(DeepLinkDestination.OwnProfile)
        assertThat(parse("meeshy://me/progression/reglages")).isEqualTo(DeepLinkDestination.OwnProfile)
    }
}
