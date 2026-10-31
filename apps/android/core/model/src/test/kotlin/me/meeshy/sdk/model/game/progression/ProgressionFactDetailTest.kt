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
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

/**
 * CHAQUE LIGNE « OÙ J'EN SUIS » PORTE LA CLÉ DE SA PRÉCISION (#13912) — miroir de `ProgressionConceptFact.detail`
 * (iOS, `GameDetailFactKey`) : le toucher d'une ligne ouvre la phrase `game.detail.fact.<donnée>` quand elle existe, la
 * phrase du concept sinon. Les clés sont celles d'iOS, valeur brute comprise.
 */
class ProgressionFactDetailTest {

    private val today: LocalDate = LocalDate.of(2026, 10, 20)
    private val now: Long = today.atStartOfDay(ZoneOffset.UTC).plusHours(12).toInstant().toEpochMilli()

    private fun game(): GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun progress(game: GameBlock?): EngagementProgress =
        EngagementProgressResolver.resolve(ApiEngagementProgress.empty.copy(game = game))

    private fun full(): GameBlock = game().let { block ->
        block.copy(
            league = GameLeagueBlock(
                unlocked = true, access = LeagueAccess.Open, weekKey = "2026-W43",
                closes = LeagueCloses(today.plusDays(2).toString(), 20 * 60),
                current = LeagueCurrent(LeagueKey.Jade, "g1", 30, 3, 120, LeagueZone.Safe, pointsToPromotion = 40),
                friends = LeagueFriends(rank = 2, size = 6, weekPoints = 80),
            ),
            season = GameSeasonBlock(
                number = 4, themeKey = "mer", startDay = "2026-10-01", endDay = "2026-11-26", week = 2, stars = 340,
                steps = 3, stepsTotal = 10, starsToNext = 60, progress = 0.3, completed = false,
                claimedSteps = emptyList(), sealOwned = false, sealPrice = 500,
            ),
            prestige = GamePrestigeBlock(stars = 1, max = 5, canPrestige = false, gloryOnPass = 5000),
        )
    }

    private fun rows(game: GameBlock?): List<FicheFact> = ProgressionConcept.entries.flatMap { concept ->
        ProgressionConceptFiches.rows(concept, progress(game), game, now, ZoneOffset.UTC)
    }

    /** La table d'iOS : l'identité d'une ligne → la clé de sa précision (`nil` : la phrase du concept). */
    private val ios: Map<ConceptFact?, GameDetailFactKey?> = mapOf(
        ConceptFact.Tier to GameDetailFactKey.Tier,
        ConceptFact.LevelNext to GameDetailFactKey.LevelNext,
        ConceptFact.LevelTop to GameDetailFactKey.LevelNext,
        ConceptFact.LevelRecord to GameDetailFactKey.LevelRecord,
        ConceptFact.Glory to GameDetailFactKey.Glory,
        ConceptFact.RankNext to null,
        ConceptFact.GloryMissing to GameDetailFactKey.GloryMissing,
        ConceptFact.StreakRecord to GameDetailFactKey.StreakRecord,
        ConceptFact.FlameState to GameDetailFactKey.FlameState,
        ConceptFact.WeekPoints to GameDetailFactKey.WeekPoints,
        ConceptFact.LeagueZone to GameDetailFactKey.LeagueZone,
        ConceptFact.LeagueMissing to GameDetailFactKey.LeagueMissing,
        ConceptFact.LeagueCloses to GameDetailFactKey.LeagueCloses,
        ConceptFact.LeagueFriends to GameDetailFactKey.LeagueFriends,
        ConceptFact.Season to GameDetailFactKey.Season,
        ConceptFact.SeasonWeek to GameDetailFactKey.SeasonWeek,
        ConceptFact.SeasonStars to GameDetailFactKey.SeasonStars,
        ConceptFact.SeasonSeal to null,
        ConceptFact.PrestigeGlory to GameDetailFactKey.PrestigeGlory,
        ConceptFact.Tailwind to GameDetailFactKey.Tailwind,
        ConceptFact.PrismHour to null,
        ConceptFact.ShowcaseVisibility to GameDetailFactKey.ShowcaseVisibility,
        ConceptFact.AtlasLeft to null,
        ConceptFact.AtlasPending to GameDetailFactKey.AtlasPending,
        ConceptFact.AtlasVisibility to null,
        ConceptFact.Left to null,
        null to null,
    )

    @Test
    fun `every where row carries the precision key iOS gives it`() {
        val served = rows(full()) + rows(null)
        served.forEach { row ->
            assertThat(ios).containsKey(row.identity)
            assertThat(row.detail).isEqualTo(ios[row.identity])
        }
        assertThat(served.mapNotNull { it.detail }.toSet()).containsAtLeast(
            GameDetailFactKey.Tier, GameDetailFactKey.WeekPoints, GameDetailFactKey.LeagueCloses,
            GameDetailFactKey.Season, GameDetailFactKey.SeasonStars, GameDetailFactKey.PrestigeGlory,
            GameDetailFactKey.StreakRecord, GameDetailFactKey.Glory,
        )
    }

    @Test
    fun `the level at its cap still opens the next level precision`() {
        val capped = game().let { it.copy(level = it.level.copy(ladder = it.level.ladder?.copy(held = false, step = null, nextThreshold = null))) }
        val top = rows(capped).single { it.identity == ConceptFact.LevelTop }
        assertThat(top.detail).isEqualTo(GameDetailFactKey.LevelNext)
    }

    @Test
    fun `the precision keys are the forty four of iOS with their raw values`() {
        assertThat(GameDetailFactKey.entries).hasSize(44)
        assertThat(GameDetailFactKey.LevelNext.wire).isEqualTo("level_next")
        assertThat(GameDetailFactKey.ShowcaseVisibility.wire).isEqualTo("showcase_visibility")
        assertThat(GameDetailFactKey.Convertible.wire).isEqualTo("convertible")
        assertThat(GameDetailFactKey.LevelRequired.wire).isEqualTo("level_required")
        assertThat(GameDetailFactKey.entries.map { it.wire }.toSet()).hasSize(44)
    }
}
