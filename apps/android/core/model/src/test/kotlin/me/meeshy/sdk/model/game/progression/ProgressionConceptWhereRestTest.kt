package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import java.time.LocalDate
import java.time.ZoneOffset
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.GamePrestigeBlock
import me.meeshy.sdk.model.game.GameSeasonBlock
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.SeasonMoment
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementElanProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * « OÙ J'EN SUIS » pour le Niveau, l'Héritage, la Ligue, le Voyage, la Renaissance, les Élans et les Étincelles (suite
 * de #13888, #13909) : la phrase d'état et les lignes de chaque concept, miroir de `ProgressionConceptModel.stateLine`
 * et `ProgressionConceptFiche.rows` (iOS), et le dédoublonnage par IDENTITÉ contre la tête générique.
 */
class ProgressionConceptWhereRestTest {

    private val moment = SeasonMoment("2026-10-20", 600)
    private val today: LocalDate = LocalDate.of(2026, 10, 20)
    private val now: Long = today.atStartOfDay(ZoneOffset.UTC).plusHours(12).toInstant().toEpochMilli()

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock? = null): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun fiche(concept: ProgressionConcept, game: GameBlock?, progress: EngagementProgress = progress(game)) =
        ProgressionConceptFiches.make(concept, progress, game, now, moment, zone = ZoneOffset.UTC)

    private fun state(concept: ProgressionConcept, game: GameBlock?, progress: EngagementProgress = progress(game)) =
        ProgressionConceptStates.stateLine(concept, progress, game)

    private fun league(
        access: LeagueAccess = LeagueAccess.Open,
        zone: LeagueZone = LeagueZone.Safe,
        toPromotion: Int? = 40,
        placed: Boolean = true,
    ) = GameLeagueBlock(
        unlocked = access != LeagueAccess.Locked,
        access = access,
        weekKey = "2026-W43",
        closes = LeagueCloses(today.plusDays(2).toString(), 20 * 60),
        current = if (placed) LeagueCurrent(LeagueKey.Jade, "g1", 30, 3, 120, zone, pointsToPromotion = toPromotion) else null,
        friends = LeagueFriends(rank = 2, size = 6, weekPoints = 80),
    )

    private fun season(steps: Int = 3, sealOwned: Boolean = false) = GameSeasonBlock(
        number = 4, themeKey = "mer", startDay = "2026-10-01", endDay = "2026-11-26", week = 2, stars = 340,
        steps = steps, stepsTotal = 10, starsToNext = 60, progress = 0.3, completed = steps >= 10,
        claimedSteps = emptyList(), sealOwned = sealOwned, sealPrice = 500,
    )

    private fun elan(accelerated: Boolean) = EngagementElanProgress(
        factor = if (accelerated) 2.0 else 1.0, activeFamilyCount = 3, hasStanding = true, windowDays = 7,
        isAccelerated = accelerated, activeFamilies = emptyList(),
    )

    private fun nested(text: GameText?, index: Int): GameText? = (text?.args?.getOrNull(index) as? GameTextArg.Nested)?.text

    @Test
    fun `un niveau retenu par son epreuve dit l epreuve et le record sans redire le palier ni le prochain niveau`() {
        val level = fiche(ProgressionConcept.Level, game())

        assertThat(level.state?.text?.key).isEqualTo(GameTextKey.LevelHeld)
        assertThat(nested(level.state?.text, 0)?.key).isEqualTo(GameTextKey.LevelStepRank)
        assertThat(level.state?.facts).containsExactly(ConceptFact.LevelStep)
        assertThat(level.facts.map { it.identity }).containsExactly(ConceptFact.LevelRecord)
        assertThat(level.facts.single().value.key).isEqualTo(GameTextKey.BannerLevel)
    }

    @Test
    fun `le niveau qui monte dit sa progression mais la tete porte deja le niveau`() {
        val block = game().let { it.copy(level = it.level.copy(ladder = it.level.ladder?.copy(held = false, step = null))) }

        assertThat(state(ProgressionConcept.Level, block)?.text?.key).isEqualTo(GameTextKey.StateLevelProgress)
        assertThat(state(ProgressionConcept.Level, block)?.facts)
            .containsExactly(ConceptFact.Level, ConceptFact.LevelProgress, ConceptFact.LevelNext).inOrder()
        assertThat(fiche(ProgressionConcept.Level, block).state).isNull()
        assertThat(ProgressionConceptFiches.rows(ProgressionConcept.Level, progress(block), block, now).map { it.label.key })
            .containsExactly(GameTextKey.FactTier, GameTextKey.FactMissingForLevel, GameTextKey.FactRecord).inOrder()
    }

    @Test
    fun `au sommet le niveau dit son plafond et la ligne du prochain niveau nomme le rang qui ouvre la suite`() {
        val block = game().let { it.copy(level = it.level.copy(ladder = it.level.ladder?.copy(held = false, step = null, nextThreshold = null))) }

        assertThat(state(ProgressionConcept.Level, block)?.text?.key).isEqualTo(GameTextKey.LevelCapReached)
        val next = ProgressionConceptFiches.rows(ProgressionConcept.Level, progress(block), block, now)
            .single { it.identity == ConceptFact.LevelTop }
        assertThat(next.label.key).isEqualTo(GameTextKey.FactNextLevel)
        assertThat(next.value.key).isEqualTo(GameTextKey.LevelCapShort)
    }

    @Test
    fun `l heritage dit ce qu il garde puis la prochaine Meesh en une phrase`() {
        val line = state(ProgressionConcept.Meesh, game())

        assertThat(line?.text?.key).isEqualTo(GameTextKey.JoinedBySpace)
        assertThat(nested(line?.text, 0)?.key).isEqualTo(GameTextKey.StateMeeshKept)
        assertThat(nested(line?.text, 1)?.key).isEqualTo(GameTextKey.StateMeeshNextMissing)
        assertThat(line?.facts).containsExactly(
            ConceptFact.MeeshHeld, ConceptFact.Minted, ConceptFact.MintNext, ConceptFact.MintPrice, ConceptFact.MintMissing,
        ).inOrder()
        assertThat(fiche(ProgressionConcept.Meesh, game()).state).isNull()
    }

    @Test
    fun `les etincelles disent la poche et ce qui manque pour la prochaine frappe`() {
        val line = state(ProgressionConcept.Points, game())

        assertThat(line?.text?.key).isEqualTo(GameTextKey.StatePointsMissingPlain)
        assertThat(line?.facts).containsExactly(
            ConceptFact.SparksPocket, ConceptFact.MintNext, ConceptFact.MintPrice, ConceptFact.MintMissing,
        ).inOrder()
        assertThat(state(ProgressionConcept.Points, null)).isNull()
    }

    @Test
    fun `la joute dit la semaine la zone le manque la fermeture et les amis sous sa tete`() {
        val block = game().copy(league = league())
        val joust = fiche(ProgressionConcept.League, block)

        assertThat(joust.state).isNull()
        assertThat(joust.facts.map { it.identity }).containsExactly(
            ConceptFact.WeekPoints, ConceptFact.LeagueZone, ConceptFact.LeagueMissing, ConceptFact.LeagueCloses,
            ConceptFact.LeagueFriends,
        ).inOrder()
        assertThat(joust.facts[1].value.key).isEqualTo(GameTextKey.LeagueZoneSafe)
        val closes = joust.facts.single { it.identity == ConceptFact.LeagueCloses }.value
        assertThat(closes).isEqualTo(GameText.of(GameTextKey.DurationDaysHours, GameTextArg.Count(2), GameTextArg.Count(8)))
    }

    @Test
    fun `la phrase de la joute enchaine la place et la zone avec ce qui manque pour monter`() {
        val line = state(ProgressionConcept.League, game().copy(league = league()))

        assertThat(nested(line?.text, 0)?.key).isEqualTo(GameTextKey.StateLeaguePlace)
        assertThat(nested(line?.text, 1)?.key).isEqualTo(GameTextKey.StateLeagueZoneSafe)
        assertThat(state(ProgressionConcept.League, game().copy(league = league(zone = LeagueZone.Promotion, toPromotion = 0)))?.facts)
            .containsExactly(ConceptFact.League, ConceptFact.LeaguePlace, ConceptFact.WeekPoints, ConceptFact.LeagueZone)
        assertThat(state(ProgressionConcept.League, game().copy(league = league(placed = false)))?.text?.key)
            .isEqualTo(GameTextKey.StateLeagueUnplaced)
        assertThat(state(ProgressionConcept.League, game().copy(league = league(access = LeagueAccess.Locked)))?.text?.key)
            .isEqualTo(GameTextKey.LeagueLocked)
    }

    @Test
    fun `une joute en zone de montee ne dit pas de manque et une joute fermee ne dit que les amis`() {
        val promoted = fiche(ProgressionConcept.League, game().copy(league = league(zone = LeagueZone.Promotion, toPromotion = 0)))
        assertThat(promoted.facts.map { it.identity }).doesNotContain(ConceptFact.LeagueMissing)

        val locked = fiche(ProgressionConcept.League, game().copy(league = league(access = LeagueAccess.Locked)))
        assertThat(locked.facts.map { it.identity }).containsExactly(ConceptFact.LeagueFriends)
    }

    @Test
    fun `le voyage dit son numero ses pas et son sceau sans redire la semaine de sa tete`() {
        val journey = fiche(ProgressionConcept.Season, game().copy(season = season()))

        assertThat(journey.state).isNull()
        assertThat(journey.facts.map { it.identity })
            .containsExactly(ConceptFact.Season, ConceptFact.SeasonStars, ConceptFact.SeasonSeal).inOrder()
        assertThat(journey.facts.last().value.key).isEqualTo(GameTextKey.FactNo)
        assertThat(state(ProgressionConcept.Season, game().copy(season = season()))?.text?.key)
            .isEqualTo(GameTextKey.StateSeasonProgress)
        assertThat(state(ProgressionConcept.Season, game().copy(season = season(steps = 10)))?.text?.key)
            .isEqualTo(GameTextKey.StateSeasonDone)
        assertThat(state(ProgressionConcept.Season, game())?.text?.key).isEqualTo(GameTextKey.SeasonNone)
    }

    @Test
    fun `la renaissance dit la gloire au passage et sa phrase suit la porte`() {
        val prestige = GamePrestigeBlock(stars = 1, max = 5, canPrestige = false, gloryOnPass = 5000)
        val rebirth = fiche(ProgressionConcept.Prestige, game().copy(prestige = prestige))

        assertThat(rebirth.facts.map { it.identity }).containsExactly(ConceptFact.PrestigeGlory)
        assertThat(rebirth.facts.single().label.key).isEqualTo(GameTextKey.FactGloryOnPass)
        assertThat(state(ProgressionConcept.Prestige, game().copy(prestige = prestige))?.text?.key)
            .isEqualTo(GameTextKey.PrestigeLocked)
        assertThat(state(ProgressionConcept.Prestige, game().copy(prestige = prestige.copy(canPrestige = true)))?.text?.key)
            .isEqualTo(GameTextKey.PrestigeMee)
        assertThat(state(ProgressionConcept.Prestige, game().copy(prestige = prestige.copy(stars = 5)))?.text?.key)
            .isEqualTo(GameTextKey.PrestigeMax)
    }

    @Test
    fun `les elans disent le vent arriere quand il souffle et l heure prisme`() {
        val block = game()
        val elans = fiche(ProgressionConcept.Elans, block)

        assertThat(elans.facts.map { it.identity }).containsExactly(ConceptFact.Tailwind, ConceptFact.PrismHour).inOrder()
        assertThat(elans.facts.first().label.key).isEqualTo(GameTextKey.TailwindName)
        assertThat(elans.facts.first().value).isEqualTo(GameText.of(GameTextKey.ValueFactor, GameTextArg.Decimal(1.25)))

        val calm = block.copy(boosts = block.boosts.copy(tailwind = 1.0, prismHour = null))
        assertThat(fiche(ProgressionConcept.Elans, calm).facts).isEmpty()
    }

    @Test
    fun `la phrase des elans dit l elan en cours ou ce qui manque pour en declencher un`() {
        val accelerated = progress().copy(elan = elan(accelerated = true))
        val idle = progress().copy(elan = elan(accelerated = false))

        assertThat(state(ProgressionConcept.Elans, null, accelerated)?.text?.key).isEqualTo(GameTextKey.StateElansActive)
        assertThat(state(ProgressionConcept.Elans, null, accelerated)?.facts)
            .containsExactly(ConceptFact.Factor, ConceptFact.ElanFamilies).inOrder()
        assertThat(state(ProgressionConcept.Elans, null, idle)?.text?.key).isEqualTo(GameTextKey.StateElansIdle)
        assertThat(state(ProgressionConcept.Elans, null, progress())).isNull()
    }
}
