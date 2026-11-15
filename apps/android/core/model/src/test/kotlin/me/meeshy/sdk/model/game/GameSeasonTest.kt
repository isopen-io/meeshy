package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class GameSeasonTest {

    @Test
    fun `une saison compte huit semaines et quarante etapes de quatre etoiles`() {
        assertThat(GameSeason.WEEKS).isEqualTo(8)
        assertThat(GameSeason.DAYS).isEqualTo(56)
        assertThat(GameSeason.STEPS).isEqualTo(40)
        assertThat(GameSeason.STARS_PER_STEP).isEqualTo(4)
    }

    @Test
    fun `les etoiles se gagnent par difficulte`() {
        assertThat(SeasonStarSource.entries.map(GameSeason::stars)).containsExactly(1, 1, 2, 3, 5).inOrder()
    }

    @Test
    fun `quatre etoiles font une etape et le parcours se plafonne a quarante`() {
        assertThat(GameSeason.progress(7).steps).isEqualTo(1)
        assertThat(GameSeason.progress(7).starsToNext).isEqualTo(1)
        val done = GameSeason.progress(999)
        assertThat(done.steps).isEqualTo(40)
        assertThat(done.completed).isTrue()
        assertThat(done.progress).isEqualTo(1.0)
        assertThat(GameSeason.progress(-5).stars).isEqualTo(0)
    }

    @Test
    fun `les recompenses gratuites ne comportent jamais de Meesh`() {
        val rewards = (1..40).map { GameSeason.stepReward(it)!!.kind }
        assertThat(rewards[3]).isEqualTo(SeasonRewardKind.Points)
        assertThat(rewards[4]).isEqualTo(SeasonRewardKind.Fragment)
        assertThat(rewards[9]).isEqualTo(SeasonRewardKind.Freeze)
        assertThat(rewards[39]).isEqualTo(SeasonRewardKind.SeasonCup)
        assertThat(GameSeason.stepReward(0)).isNull()
        assertThat(GameSeason.stepReward(41)).isNull()
    }

    @Test
    fun `les points d'etape suivent le calendrier servi ou, a defaut, la loi`() {
        assertThat(GameSeason.stepReward(1, 150)!!.amount).isEqualTo(150)
        assertThat(GameSeason.stepReward(1, 0)!!.amount).isEqualTo(100)
        assertThat(GameSeason.stepReward(1, null)!!.amount).isEqualTo(100)
    }

    @Test
    fun `le Sceau offre un cosmetique toutes les quatre etapes sans avantage de jeu`() {
        assertThat(GameSeason.sealReward(2, 4)).isEqualTo(SeasonSeal("season-2.seal-1"))
        assertThat(GameSeason.sealReward(2, 40)).isEqualTo(SeasonSeal("season-2.seal-10"))
        assertThat(GameSeason.sealReward(2, 5)).isNull()
        assertThat(GameSeason.sealReward(2, 0)).isNull()
    }

    @Test
    fun `l'achat du Sceau est refuse si possede ou trop pauvre`() {
        assertThat(GameSeason.sealRefusal(10, owned = false)).isNull()
        assertThat(GameSeason.sealRefusal(9, owned = false)).isEqualTo(SeasonSealRefusal.InsufficientBalance)
        assertThat(GameSeason.sealRefusal(100, owned = true)).isEqualTo(SeasonSealRefusal.AlreadyOwned)
    }

    @Test
    fun `la reclamation est refusee hors bornes, deja faite ou verrouillee`() {
        fun claim(step: Int, reached: Int = 10, claimed: List<Int> = emptyList()) =
            GameSeason.claim(1, step, reached, claimed, sealOwned = true)
        assertThat(claim(0)).isEqualTo(SeasonClaim.Refused(SeasonClaimRefusal.OutOfRange))
        assertThat(claim(3, claimed = listOf(3))).isEqualTo(SeasonClaim.Refused(SeasonClaimRefusal.AlreadyClaimed))
        assertThat(claim(11)).isEqualTo(SeasonClaim.Refused(SeasonClaimRefusal.Locked))
        assertThat(claim(8)).isEqualTo(SeasonClaim.Allowed(SeasonRewardBlock(SeasonRewardKind.Points, 100), SeasonSeal("season-1.seal-2")))
    }

    @Test
    fun `le reglement n'accorde la coupe, le badge date et la Gloire qu'au parcours termine`() {
        assertThat(GameSeason.settlement(3, 40)).isEqualTo(SeasonSettlement(true, 5000, true, "season.3"))
        assertThat(GameSeason.settlement(3, 39)).isEqualTo(SeasonSettlement(false, 0, false, null))
    }

    @Test
    fun `la saison une ouvre le lundi 21 decembre 2026 et les saisons s'enchainent de 56 jours`() {
        val one = GameSeason.calendar(1)!!
        assertThat(one.startDay).isEqualTo("2026-12-21")
        assertThat(one.endDay).isEqualTo("2027-02-14")
        assertThat(one.weekKeys).hasSize(8)
        assertThat(GameSeason.calendar(2)!!.startDay).isEqualTo("2027-02-15")
        assertThat(GameSeason.calendar(9)!!.themeKey).isEqualTo(one.themeKey)
        assertThat(GameSeason.calendar(0)).isNull()
    }

    @Test
    fun `la saison a venir est la premiere tant qu'aucune n'est ouverte`() {
        assertThat(GameSeason.upcoming(SeasonMoment("2026-10-11", 0))!!.number).isEqualTo(1)
        assertThat(GameSeason.upcoming(SeasonMoment("2027-01-05", 0))).isNull()
    }

    @Test
    fun `une saison a venir gardee hors ligne bascule a l'ouverture, jamais en arriere`() {
        val before = SeasonMoment("2026-12-20", 1199)
        val after = SeasonMoment("2026-12-20", 1200)
        assertThat(GameSeason.liveTense(GameArchiveStatus.Upcoming, "2026-12-21", "2027-02-14", before)).isEqualTo(GameArchiveStatus.Upcoming)
        assertThat(GameSeason.liveTense(GameArchiveStatus.Upcoming, "2026-12-21", "2027-02-14", after)).isEqualTo(GameArchiveStatus.Current)
        assertThat(GameSeason.liveTense(GameArchiveStatus.Past, "2026-12-21", "2027-02-14", before)).isEqualTo(GameArchiveStatus.Past)
    }
}
