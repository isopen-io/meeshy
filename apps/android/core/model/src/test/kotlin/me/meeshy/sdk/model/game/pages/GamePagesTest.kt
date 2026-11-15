package me.meeshy.sdk.model.game.pages

import com.google.common.truth.Truth.assertThat
import java.time.LocalDateTime
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameTrophiesBlock
import me.meeshy.sdk.model.game.GameTrophyItem
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCup
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueWeekEntry
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

class GamePagesTest {

    @Test
    fun `chaque concept a sa seule sous-page et les sept du jeu de base n en ont aucune`() {
        assertThat(GamePageLinks.of(ProgressionConcept.League)).containsExactly(GamePage.League)
        assertThat(GamePageLinks.of(ProgressionConcept.Season)).containsExactly(GamePage.Season)
        assertThat(GamePageLinks.of(ProgressionConcept.Prestige)).containsExactly(GamePage.Prestige)
        assertThat(GamePageLinks.of(ProgressionConcept.Showcase)).containsExactly(GamePage.Showcase)
        assertThat(GamePageLinks.of(ProgressionConcept.Atlas)).containsExactly(GamePage.Atlas)
        listOf(
            ProgressionConcept.Level, ProgressionConcept.Points, ProgressionConcept.Meesh, ProgressionConcept.Glory,
            ProgressionConcept.Flame, ProgressionConcept.Missions, ProgressionConcept.Elans,
        ).forEach { assertThat(GamePageLinks.of(it)).isEmpty() }
    }

    @Test
    fun `les reglages n appartiennent a aucun concept et une page se relit par son nom`() {
        assertThat(GamePage.Settings.concept).isNull()
        assertThat(GamePage.fromWire("atlas")).isEqualTo(GamePage.Atlas)
        assertThat(GamePage.fromWire("inconnue")).isNull()
        assertThat(GamePage.fromWire(null)).isNull()
    }

    private val closes = LeagueCloses(dayKey = "2026-11-01", minuteOfDay = 20 * 60)

    @Test
    fun `le temps restant se dit en jours et heures puis heures puis minutes`() {
        assertThat(GameWeekClock.remaining(closes, LocalDateTime.of(2026, 10, 30, 10, 0)))
            .isEqualTo(GameDuration.DaysHours(days = 2, hours = 10))
        assertThat(GameWeekClock.remaining(closes, LocalDateTime.of(2026, 11, 1, 15, 30)))
            .isEqualTo(GameDuration.Hours(hours = 4))
        assertThat(GameWeekClock.remaining(closes, LocalDateTime.of(2026, 11, 1, 19, 15)))
            .isEqualTo(GameDuration.Minutes(minutes = 45))
    }

    @Test
    fun `la fermeture passee ou immediate se dit une minute et une date illisible ne dit rien`() {
        assertThat(GameWeekClock.remaining(closes, LocalDateTime.of(2026, 11, 2, 9, 0)))
            .isEqualTo(GameDuration.Minutes(minutes = 1))
        assertThat(GameWeekClock.remaining(closes.copy(dayKey = "demain"), LocalDateTime.of(2026, 11, 1, 9, 0))).isNull()
    }

    @Test
    fun `une seconde de plus compte une minute entiere`() {
        assertThat(GameWeekClock.remaining(closes, LocalDateTime.of(2026, 11, 1, 19, 58, 59)))
            .isEqualTo(GameDuration.Minutes(minutes = 2))
    }

    private fun season(steps: Int, claimed: List<Int>, sealOwned: Boolean = false, stepPoints: Int? = null) = GameSeasonBlock(
        number = 1, themeKey = "language:sw", startDay = "2026-12-21", endDay = "2027-02-14", week = 2, stars = steps * 4,
        steps = steps, stepsTotal = 40, starsToNext = 3, progress = steps / 40.0, completed = false, claimedSteps = claimed,
        nextReward = null, sealOwned = sealOwned, sealPrice = 10, stepPoints = stepPoints,
    )

    @Test
    fun `une halte est reclamee prete ou a venir selon ce que le serveur sert`() {
        val served = season(steps = 6, claimed = listOf(1, 2, 3))
        assertThat(SeasonPath.state(2, served)).isEqualTo(SeasonStepState.Claimed)
        assertThat(SeasonPath.state(4, served)).isEqualTo(SeasonStepState.Ready)
        assertThat(SeasonPath.state(6, served)).isEqualTo(SeasonStepState.Ready)
        assertThat(SeasonPath.state(7, served)).isEqualTo(SeasonStepState.Locked)
    }

    @Test
    fun `le parcours compte quarante haltes et dix pastilles de Sceau`() {
        assertThat(SeasonPath.steps).hasSize(40)
        assertThat(SeasonPath.sealSteps).containsExactly(4, 8, 12, 16, 20, 24, 28, 32, 36, 40).inOrder()
    }

    @Test
    fun `une pastille de Sceau n est allumee que possedee et atteinte`() {
        assertThat(SeasonPath.sealLit(4, season(steps = 5, claimed = emptyList(), sealOwned = true))).isTrue()
        assertThat(SeasonPath.sealLit(8, season(steps = 5, claimed = emptyList(), sealOwned = true))).isFalse()
        assertThat(SeasonPath.sealLit(4, season(steps = 5, claimed = emptyList(), sealOwned = false))).isFalse()
    }

    @Test
    fun `le theme d une saison est une langue et un theme inconnu ne se nomme pas`() {
        assertThat(SeasonPath.themeLanguage("language:sw")).isEqualTo("sw")
        assertThat(SeasonPath.themeLanguage("food:pizza")).isNull()
        assertThat(SeasonPath.themeLanguage("language:")).isNull()
        assertThat(SeasonPath.themeLanguage("language")).isNull()
    }

    private fun entry(rank: Int, zone: LeagueZone, isMe: Boolean = false) =
        LeagueWeekEntry(rank = rank, displayName = "Heros $rank", weekPoints = 100 - rank, zone = zone, cup = null, isMe = isMe)

    @Test
    fun `une etiquette de zone s ouvre a la premiere ligne et a chaque changement de zone`() {
        val rows = LeagueStandings.rows(
            listOf(entry(1, LeagueZone.Promotion), entry(2, LeagueZone.Promotion), entry(3, LeagueZone.Safe), entry(4, LeagueZone.Relegation)),
        )
        assertThat(rows.map { it.opensZone }).containsExactly(true, false, true, true).inOrder()
        assertThat(LeagueStandings.rows(emptyList())).isEmpty()
    }

    private fun current(toPromotion: Int?) = LeagueCurrent(
        league = LeagueKey.Jade, groupId = "g", groupSize = 30, rank = 4, weekPoints = 80, zone = LeagueZone.Safe,
        cup = LeagueCup.Gold.takeIf { false }, pointsToPromotion = toPromotion,
    )

    @Test
    fun `l ecart a la montee se dit par un fait`() {
        assertThat(LeagueStandings.gap(current(null))).isEqualTo(LeagueGap.AtTop)
        assertThat(LeagueStandings.gap(current(0))).isEqualTo(LeagueGap.InPromotion)
        assertThat(LeagueStandings.gap(current(35))).isEqualTo(LeagueGap.ToPromotion(35))
    }

    @Test
    fun `la ligue des amis se tait quand je suis seul`() {
        assertThat(LeagueStandings.friendsAreAlone(1)).isTrue()
        assertThat(LeagueStandings.friendsAreAlone(0)).isTrue()
        assertThat(LeagueStandings.friendsAreAlone(2)).isFalse()
    }

    @Test
    fun `une cle de trophee rend son trophee et une cle inconnue rend rien`() {
        assertThat(GameTrophyShelf.parse("trophy.league-cup.2026-10-26.jade.gold"))
            .isEqualTo(TrophySpec.LeagueCupOf(TrophyPeriod.Week("2026-10-26"), LeagueKey.Jade, LeagueCup.Gold))
        assertThat(GameTrophyShelf.parse("trophy.league-cup.2026-10.rubis.bronze"))
            .isEqualTo(TrophySpec.LeagueCupOf(TrophyPeriod.Month("2026-10"), LeagueKey.Rubis, LeagueCup.Bronze))
        assertThat(GameTrophyShelf.parse("trophy.season-cup.3")).isEqualTo(TrophySpec.SeasonCup(3))
        assertThat(GameTrophyShelf.parse("trophy.prestige.5")).isEqualTo(TrophySpec.Prestige(5))
        assertThat(GameTrophyShelf.parse("trophy.flame.365")).isEqualTo(TrophySpec.Flame(365))
        listOf(
            "trophy.prestige.6", "trophy.flame.50", "trophy.season-cup.0", "trophy.season-cup.03", "trophy.league-cup.2026-13.jade.gold",
            "trophy.league-cup.2026-10-26.pluton.gold", "badge.first", "trophy", "", "trophy.future.1",
        ).forEach { assertThat(GameTrophyShelf.parse(it)).isNull() }
    }

    private fun item(key: String) = GameTrophyItem(key = key, awardedAt = "2026-10-26T10:00:00.000Z")

    @Test
    fun `l etagere suit l ordre servi puis le reste et ne montre pas une cle d une version plus recente`() {
        val trophies = GameTrophiesBlock(
            items = listOf(item("trophy.season-cup.1"), item("trophy.prestige.1"), item("trophy.future.9"), item("trophy.flame.100")),
            order = listOf("trophy.prestige.1", "trophy.absent.1", "trophy.prestige.1", "trophy.season-cup.1"),
        )
        assertThat(GameTrophyShelf.shelfOrder(trophies))
            .containsExactly("trophy.prestige.1", "trophy.season-cup.1", "trophy.future.9", "trophy.flame.100").inOrder()
        assertThat(GameTrophyShelf.shown(trophies))
            .containsExactly("trophy.prestige.1", "trophy.season-cup.1", "trophy.flame.100").inOrder()
    }

    @Test
    fun `les reglages d appareil ont pour defaut le jeu visible et les celebrations permises`() {
        val defaults = GameDevicePrefs()
        assertThat(defaults.hidden).isFalse()
        assertThat(defaults.celebrations).isTrue()
        assertThat(defaults.offersPhotos).isTrue()
        assertThat(defaults.copy(hidden = true).offersPhotos).isFalse()
        assertThat(defaults.copy(celebrations = false).offersPhotos).isFalse()
    }
}
