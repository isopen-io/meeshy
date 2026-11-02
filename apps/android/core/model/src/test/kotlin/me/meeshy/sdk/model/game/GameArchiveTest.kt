package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameArchiveTest {

    private fun season(status: GameArchiveStatus) = GameSeasonArchive(
        number = 1, status = status, themeKey = "language:fr", startDay = "2026-12-21", endDay = "2027-02-14",
        weekKeys = emptyList(), progress = null,
    )

    private fun week(retention: GameArchiveRetention, hasResult: Boolean) = GameLeagueWeekArchive(
        weekKey = "2026-12-21", status = GameArchiveStatus.Past, season = 1, retention = retention,
        result = if (hasResult) GameLeagueWeekResult(league = LeagueKey.entries.first(), settled = true) else null,
    )

    @Test
    fun `une saison a venir gardee hors ligne est en cours des l'ouverture, sans reseau`() {
        val kept = season(GameArchiveStatus.Upcoming)
        assertThat(kept.liveStatus(SeasonMoment("2026-12-20", 1199))).isEqualTo(GameArchiveStatus.Upcoming)
        assertThat(kept.liveStatus(SeasonMoment("2026-12-20", 1200))).isEqualTo(GameArchiveStatus.Current)
        assertThat(kept.liveStatus(SeasonMoment("2027-02-14", 1200))).isEqualTo(GameArchiveStatus.Past)
    }

    @Test
    fun `l'etat servi est un plancher qu'une horloge en retard ne fait pas reculer`() {
        assertThat(season(GameArchiveStatus.Past).liveStatus(SeasonMoment("2026-01-01", 0))).isEqualTo(GameArchiveStatus.Past)
    }

    @Test
    fun `une semaine purgee le dit et ne montre aucun resultat`() {
        assertThat(week(GameArchiveRetention.Purged, hasResult = true).isPurged).isTrue()
        assertThat(week(GameArchiveRetention.Purged, hasResult = true).hasResult).isFalse()
        assertThat(week(GameArchiveRetention.Kept, hasResult = true).hasResult).isTrue()
        assertThat(week(GameArchiveRetention.Kept, hasResult = false).hasResult).isFalse()
    }
}
