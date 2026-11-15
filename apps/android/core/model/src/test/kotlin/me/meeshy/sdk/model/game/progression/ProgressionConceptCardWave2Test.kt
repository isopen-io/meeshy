package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AtlasPending
import me.meeshy.sdk.model.game.GameAtlasBlock
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GameTrophiesBlock
import me.meeshy.sdk.model.game.GameTrophyItem
import me.meeshy.sdk.model.game.GameUpcomingSeasonBlock
import me.meeshy.sdk.model.game.GameVisibility
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/** La loi des cartes de concept, vague 2 : ligue, saison, Prestige, vitrine et Atlas (iOS `ProgressionConceptModel`). */
class ProgressionConceptCardWave2Test {

    private val moment = SeasonMoment("2026-10-20", 600)
    private val now = 1_792_000_000_000L

    private fun base(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock?): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun cards(game: GameBlock?, at: SeasonMoment = moment) =
        ProgressionConceptModel.cards(progress(game), game, now, at)

    private fun card(concept: ProgressionConcept, game: GameBlock?) = cards(game).first { it.concept == concept }

    private fun count(n: Int) = GameTextArg.Count(n)

    private fun current(rank: Int = 7, zone: LeagueZone = LeagueZone.Safe) = LeagueCurrent(
        league = LeagueKey.Jade, groupId = "g", groupSize = 30, rank = rank, weekPoints = 120, zone = zone,
        pointsToPromotion = 40,
    )

    private fun league(access: LeagueAccess = LeagueAccess.Open, current: LeagueCurrent? = current()) = GameLeagueBlock(
        unlocked = access != LeagueAccess.Locked, access = access, weekKey = "2026-10-19",
        closes = LeagueCloses("2026-10-25", 1200), current = current, friends = LeagueFriends(1, 3, 10),
    )

    private fun season(steps: Int = 12, completed: Boolean = false) = GameSeasonBlock(
        number = 2, themeKey = "aurore", startDay = "2026-10-19", endDay = "2026-12-13", week = 2, stars = 30,
        steps = steps, stepsTotal = 40, starsToNext = 3, progress = steps / 40.0, completed = completed,
        claimedSteps = emptyList(), sealOwned = false, sealPrice = 500,
    )

    private fun prestige(stars: Int = 1, can: Boolean = false) =
        GamePrestigeBlock(stars = stars, max = 5, canPrestige = can, gloryOnPass = 100)

    @Test
    fun `sans extension servie les cinq cartes ne paraissent pas et l ecran se raccourcit`() {
        val concepts = cards(base()).map { it.concept }

        assertThat(concepts).containsNoneOf(
            ProgressionConcept.League, ProgressionConcept.Season, ProgressionConcept.Prestige,
            ProgressionConcept.Showcase, ProgressionConcept.Atlas,
        )
    }

    @Test
    fun `chaque extension servie ajoute sa carte a sa place`() {
        val game = base().copy(
            league = league(), season = season(), prestige = prestige(),
            trophies = GameTrophiesBlock(emptyList(), emptyList()),
            atlas = GameAtlasBlock(3, 83, emptyList(), emptyList()),
        )
        val concepts = cards(game).map { it.concept }

        assertThat(concepts).containsAtLeast(
            ProgressionConcept.League, ProgressionConcept.Season, ProgressionConcept.Prestige,
            ProgressionConcept.Showcase, ProgressionConcept.Atlas,
        ).inOrder()
    }

    @Test
    fun `la ligue dit son cercle et la place sur trente`() {
        val league = card(ProgressionConcept.League, base().copy(league = league()))

        assertThat(league.value).isEqualTo(ProgressionConceptModel.leagueName(LeagueKey.Jade))
        assertThat(league.valueFact).isEqualTo(ConceptFact.League)
        assertThat(league.line).isEqualTo(GameText.of(GameTextKey.LeagueRankLine, count(7), count(30)))
        assertThat(league.lineFacts).containsExactly(ConceptFact.LeaguePlace)
        assertThat(league.urgent).isFalse()
        assertThat(league.gauge).isNull()
    }

    @Test
    fun `la ligue fermee dit le niveau qui l ouvre sans ligne`() {
        val league = card(ProgressionConcept.League, base().copy(league = league(LeagueAccess.Locked, null)))

        assertThat(league.valueFact).isEqualTo(ConceptFact.LeagueUnlockLevel)
        assertThat(league.value?.key).isEqualTo(GameTextKey.DoorLeagueLocked)
        assertThat(league.line).isNull()
    }

    @Test
    fun `la ligue ouverte mais non placee ouvre la porte des amis`() {
        val league = card(ProgressionConcept.League, base().copy(league = league(current = null)))

        assertThat(league.value?.key).isEqualTo(GameTextKey.DoorLeagueOpen)
        assertThat(league.line?.key).isEqualTo(GameTextKey.LeagueFriendsTitle)
    }

    @Test
    fun `la saison dit les etapes sur quarante et la semaine`() {
        val season = card(ProgressionConcept.Season, base().copy(season = season()))

        assertThat(season.value).isEqualTo(GameText.of(GameTextKey.DoorSeasonSteps, count(12), count(40)))
        assertThat(season.valueFact).isEqualTo(ConceptFact.SeasonSteps)
        assertThat(season.line?.key).isEqualTo(GameTextKey.ChipWeekOf)
        assertThat(season.gauge).isWithin(1e-9).of(0.3)
    }

    @Test
    fun `une saison terminee n a plus de jauge`() {
        val season = card(ProgressionConcept.Season, base().copy(season = season(steps = 40, completed = true)))

        assertThat(season.gauge).isNull()
    }

    @Test
    fun `avant la premiere saison la carte dit la date d ouverture jamais un vide`() {
        val upcoming = GameUpcomingSeasonBlock(1, "aurore", "2026-10-26", "2026-12-20")
        val game = base().copy(seasonUpcoming = upcoming, league = league())

        val before = card(ProgressionConcept.Season, game)
        assertThat(before.value?.key).isEqualTo(GameTextKey.DoorSeasonUpcoming)
        assertThat(before.line).isNull()

        val opened = ProgressionConceptModel.cards(progress(game), game, now, SeasonMoment("2026-10-26", 1300))
            .first { it.concept == ProgressionConcept.Season }
        assertThat(opened.value).isEqualTo(GameText.of(GameTextKey.DoorSeason, count(1)))
    }

    @Test
    fun `une saison nulle sur un serveur de la vague 2 garde sa carte et le dit`() {
        val season = card(ProgressionConcept.Season, base().copy(league = league()))

        assertThat(season.value?.key).isEqualTo(GameTextKey.DoorSeasonNone)
    }

    @Test
    fun `le Prestige dit les etoiles et la porte qui reste fermee`() {
        val prestige = card(ProgressionConcept.Prestige, base().copy(prestige = prestige()))

        assertThat(prestige.value).isEqualTo(GameText.of(GameTextKey.Ratio, count(1), count(5)))
        assertThat(prestige.line?.key).isEqualTo(GameTextKey.DoorPrestigeLocked)
        assertThat(prestige.urgent).isFalse()
    }

    @Test
    fun `la Renaissance possible prend la ligne et se marque urgente`() {
        val prestige = card(ProgressionConcept.Prestige, base().copy(prestige = prestige(can = true)))

        assertThat(prestige.urgent).isTrue()
        assertThat(prestige.line?.key).isEqualTo(GameTextKey.DoorPrestigeReady)
    }

    @Test
    fun `les cinq etoiles disent le sommet`() {
        val prestige = card(ProgressionConcept.Prestige, base().copy(prestige = prestige(stars = 5)))

        assertThat(prestige.line?.key).isEqualTo(GameTextKey.BannerTop)
    }

    @Test
    fun `la vitrine vide se dit une fois sans ligne`() {
        val showcase = card(ProgressionConcept.Showcase, base().copy(trophies = GameTrophiesBlock(emptyList(), emptyList())))

        assertThat(showcase.value?.key).isEqualTo(GameTextKey.DoorShowcaseEmpty)
        assertThat(showcase.line).isNull()
    }

    @Test
    fun `la vitrine pleine dit le nombre et qui la voit selon la visibilite du joueur`() {
        val trophies = GameTrophiesBlock(listOf(GameTrophyItem("trophy.flame.100", "2026-10-01T10:00:00.000Z")), emptyList())
        val visibility = GameVisibility(ShowcaseVisibility.Friends, ShowcaseVisibility.Me, ShowcaseVisibility.Me, ShowcaseVisibility.Me)

        val showcase = card(ProgressionConcept.Showcase, base().copy(trophies = trophies, visibility = visibility))

        assertThat(showcase.value?.key).isEqualTo(GameTextKey.DoorShowcaseCount)
        assertThat(showcase.line?.key).isEqualTo(GameTextKey.ChipVisible)
        assertThat(showcase.line?.args?.single()).isEqualTo(GameTextArg.Nested(ProgressionConceptModel.visibilityLabel(ShowcaseVisibility.Friends)))
        assertThat(showcase.lineFacts).containsExactly(ConceptFact.ShowcaseVisibility)
    }

    @Test
    fun `sans visibilite servie la vitrine ne devine pas qui la voit`() {
        val trophies = GameTrophiesBlock(listOf(GameTrophyItem("trophy.flame.100", "2026-10-01T10:00:00.000Z")), emptyList())

        assertThat(card(ProgressionConcept.Showcase, base().copy(trophies = trophies)).line).isNull()
    }

    @Test
    fun `l Atlas dit n sur total langues et ce qui reste avec sa jauge`() {
        val atlas = card(
            ProgressionConcept.Atlas,
            base().copy(atlas = GameAtlasBlock(3, 83, emptyList(), listOf(AtlasPending("sw", true, false)))),
        )

        assertThat(atlas.value).isEqualTo(GameText.of(GameTextKey.Ratio, count(3), count(83)))
        assertThat(atlas.line).isEqualTo(GameText.of(GameTextKey.AtlasRemaining, count(80)))
        assertThat(atlas.gauge).isWithin(1e-9).of(3 / 83.0)
    }

    @Test
    fun `un Atlas complet ne dit jamais un reste negatif`() {
        val atlas = card(ProgressionConcept.Atlas, base().copy(atlas = GameAtlasBlock(90, 83, emptyList(), emptyList())))

        assertThat(atlas.line).isEqualTo(GameText.of(GameTextKey.AtlasRemaining, count(0)))
    }

    @Test
    fun `aucune carte de la vague 2 ne redit sa valeur dans sa ligne`() {
        val game = base().copy(
            league = league(), season = season(), prestige = prestige(can = true),
            trophies = GameTrophiesBlock(listOf(GameTrophyItem("trophy.flame.100", "2026-10-01T10:00:00.000Z")), emptyList()),
            visibility = GameVisibility(ShowcaseVisibility.Everyone, ShowcaseVisibility.Me, ShowcaseVisibility.Me, ShowcaseVisibility.Me),
            atlas = GameAtlasBlock(3, 83, emptyList(), emptyList()),
        )

        cards(game).forEach { card ->
            assertThat(card.lineFacts).doesNotContain(card.valueFact)
            card.emblemFact?.let { assertThat(card.lineFacts).doesNotContain(it) }
        }
    }
}
