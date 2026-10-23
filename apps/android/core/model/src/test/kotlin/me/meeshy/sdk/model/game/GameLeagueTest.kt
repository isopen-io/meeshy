package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameLeagueTest {

    private fun entrants(count: Int) = (0 until count).map { LeagueEntrant("e%03d".format(it), 1000 - it) }
    private fun members(count: Int) = (1..count).map { LeagueMemberPoints("u%02d".format(it), 1000 - it * 10) }

    @Test
    fun `31 inscrits font deux groupes de 16 et 15 jamais 30 et 1`() {
        val groups = GameLeague.partition("2026-10-05", LeagueKey.Jade, entrants(31))
        assertThat(groups.map { it.memberIds.size }).containsExactly(16, 15).inOrder()
        assertThat(groups.map { it.groupId }).containsExactly("2026-10-05:jade:1", "2026-10-05:jade:2").inOrder()
    }

    @Test
    fun `la repartition est deterministe et ignore l ordre d entree`() {
        val a = GameLeague.partition("2026-10-05", LeagueKey.Quartz, entrants(45))
        val b = GameLeague.partition("2026-10-05", LeagueKey.Quartz, entrants(45).reversed())
        assertThat(b).isEqualTo(a)
        assertThat(GameLeague.partition("2026-10-05", LeagueKey.Quartz, emptyList())).isEmpty()
    }

    @Test
    fun `7 montent 5 descendent et 3 coupes dans un groupe de 30`() {
        val s = GameLeague.standings("g", LeagueKey.Jade, members(30))
        assertThat(s.count { it.zone == LeagueZone.Promotion }).isEqualTo(7)
        assertThat(s.count { it.zone == LeagueZone.Relegation }).isEqualTo(5)
        assertThat(s.mapNotNull { it.cup }).containsExactly(LeagueCup.Gold, LeagueCup.Silver, LeagueCup.Bronze).inOrder()
    }

    @Test
    fun `rien au dessus du Prisme ni sous le Quartz`() {
        assertThat(GameLeague.standings("g", LeagueKey.Prisme, members(30)).none { it.zone == LeagueZone.Promotion }).isTrue()
        assertThat(GameLeague.standings("g", LeagueKey.Quartz, members(30)).none { it.zone == LeagueZone.Relegation }).isTrue()
    }

    @Test
    fun `qui n a gagne aucun point ne monte pas et n a pas de coupe`() {
        val s = GameLeague.standings("g", LeagueKey.Jade, listOf(LeagueMemberPoints("a", 0), LeagueMemberPoints("b", 0)))
        assertThat(s.map { it.zone }).doesNotContain(LeagueZone.Promotion)
        assertThat(s.mapNotNull { it.cup }).isEmpty()
    }

    @Test
    fun `la semaine commence le lundi et ferme le dimanche 20 h`() {
        assertThat(GameLeague.weekKey("2026-10-11")).isEqualTo("2026-10-05")
        assertThat(GameLeague.weekClose("2026-10-05")).isEqualTo(LeagueMoment("2026-10-11", 1200))
        assertThat(GameLeague.weekOfMoment(LeagueMoment("2026-10-11", 1200))).isEqualTo("2026-10-12")
        assertThat(GameLeague.nextWeekClose(LeagueMoment("2026-10-11", 1199))).isEqualTo(LeagueMoment("2026-10-11", 1200))
        assertThat(GameLeague.nextWeekClose(LeagueMoment("2026-10-11", 1200))).isEqualTo(LeagueMoment("2026-10-18", 1200))
    }

    @Test
    fun `l acces se lit verrouille mineur consentement ou ouvert`() {
        assertThat(GameLeague.access(9, true, true)).isEqualTo(LeagueAccess.Locked)
        assertThat(GameLeague.access(10, false, true)).isEqualTo(LeagueAccess.Minor)
        assertThat(GameLeague.access(10, true, false)).isEqualTo(LeagueAccess.ConsentRequired)
        assertThat(GameLeague.access(10, true, true)).isEqualTo(LeagueAccess.Open)
    }

    @Test
    fun `un pseudonyme reserve ou civil ou mal forme est refuse`() {
        assertThat(GameLeague.checkPseudonym("Zephyr", listOf("Durand"))).isEqualTo(LeaguePseudonymCheck.Ok)
        assertThat(GameLeague.checkPseudonym("xxMeeshyxx", emptyList()))
            .isEqualTo(LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Reserved))
        assertThat(GameLeague.checkPseudonym("Adm.in", emptyList()))
            .isEqualTo(LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Reserved))
        assertThat(GameLeague.checkPseudonym("Amélie", listOf("Amelie")))
            .isEqualTo(LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Identity))
        assertThat(GameLeague.checkPseudonym("0612345678", emptyList()))
            .isEqualTo(LeaguePseudonymCheck.Refused(LeaguePseudonymCheck.Reason.Shape))
        assertThat(GameLeague.checkPseudonym("meeting", emptyList())).isEqualTo(LeaguePseudonymCheck.Ok)
    }

    @Test
    fun `la fermeture fige l instantane avant 4 h sur la veille`() {
        assertThat(GameLeague.snapshotDay(LeagueMoment("2026-10-14", 239))).isEqualTo("2026-10-13")
        assertThat(GameLeague.snapshotDay(LeagueMoment("2026-10-14", 240))).isEqualTo("2026-10-14")
    }

    @Test
    fun `le reglement verse la Gloire de montee et de coupe`() {
        val first = GameLeague.settle("g", LeagueKey.Jade, members(30)).first()
        assertThat(first.outcome.nextLeague).isEqualTo(LeagueKey.Saphir)
        assertThat(first.outcome.glory).isEqualTo(1300)
    }
}
