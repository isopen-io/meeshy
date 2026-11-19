package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.progression.ProgressionConcept
import org.junit.Test

/**
 * Miroir des témoins iOS `GamePlayerBannerPiecesTests` et `GamePlayerBannerMeaningTests` (#18230, #19921) : le bandeau
 * ne montre que ce qui existe, le rang en tête, et chaque pièce mène à sa fiche.
 */
class GamePlayerBannerTest {

    private val served: GameBlock = checkNotNull(GameBlockParser.parse(GameBlockFixtures.block()))

    private fun level(level: Int, score: Long, prestige: Int = 0): GameLevel = GameLevel(
        level = level, tier = served.level.tier, score = score, floorScore = 0, nextThreshold = score + 100,
        pointsToNext = 100, progress = 0.0, record = level, prestige = prestige, canPrestige = false,
    )

    private fun flame(days: Int, form: FlameFormKey?, status: FlameStatus): GameFlame = GameFlame(
        days = days, form = form, bonusPercent = 0, freezes = 0, maxFreezes = 2, freezePrice = 1, relightPrice = 3,
        status = status, canRelight = false,
    )

    private val noGlory = GameGlory(glory = 0, rank = GloryRank.entries.first(), division = 3, progress = 0.0)

    private fun nothing(
        level: GameLevel = level(1, score = 0),
        held: Int = 0,
        glory: GameGlory = noGlory,
        flame: GameFlame = flame(days = 0, form = null, status = FlameStatus.None),
    ): GameBlock = served.copy(
        level = level,
        glory = glory,
        treasury = TreasuryStanding(held = held, tier = if (held > 0) TreasuryTierKey.Bourse else null),
        flame = flame,
        league = null,
        season = null,
        trophies = null,
    )

    private fun banner(
        level: Int = 12,
        score: Long = 900,
        meeshes: Int? = null,
        rank: GamePlayerBanner.Rank? = null,
        league: GamePlayerBanner.League? = null,
        flame: GamePlayerBanner.Flame? = null,
        trophies: Int? = null,
        dailyMission: GamePlayerBanner.DailyMission? = null,
        season: GamePlayerBanner.Season? = null,
        treasury: TreasuryTierKey? = null,
        attention: GameAttention = GameAttention.None,
    ) = GamePlayerBanner(
        level = level, tier = served.level.tier, progress = 0.4, score = score, nextLevel = level + 1,
        pointsToNext = 200, meeshes = meeshes, rank = rank, league = league, flame = flame, trophies = trophies,
        dailyMission = dailyMission, season = season, treasury = treasury, attention = attention,
    )

    @Test
    fun `chaque piece mene a sa fiche`() {
        val expected = mapOf(
            GamePlayerBanner.Piece.Sparks to ProgressionConcept.Points,
            GamePlayerBanner.Piece.Rank to ProgressionConcept.Glory,
            GamePlayerBanner.Piece.Level to ProgressionConcept.Level,
            GamePlayerBanner.Piece.Meesh to ProgressionConcept.Meesh,
            GamePlayerBanner.Piece.Flame to ProgressionConcept.Flame,
            GamePlayerBanner.Piece.League to ProgressionConcept.League,
            GamePlayerBanner.Piece.Trophies to ProgressionConcept.Showcase,
            GamePlayerBanner.Piece.Mission to ProgressionConcept.Missions,
            GamePlayerBanner.Piece.Offering to ProgressionConcept.Missions,
            GamePlayerBanner.Piece.Season to ProgressionConcept.Season,
            GamePlayerBanner.Piece.Treasury to ProgressionConcept.Meesh,
        )
        GamePlayerBanner.Piece.entries.forEach { piece -> assertThat(piece.concept).isEqualTo(expected[piece]) }
        assertThat(GamePlayerBanner.Piece.entries).hasSize(11)
    }

    @Test
    fun `seulement les pieces qui existent, dans l'ordre du bandeau, le rang en tete`() {
        val full = banner(
            meeshes = 3,
            rank = GamePlayerBanner.Rank(rank = GloryRank.entries[1], division = 2),
            league = GamePlayerBanner.League(league = LeagueKey.entries.first(), place = 4),
            flame = GamePlayerBanner.Flame(form = FlameFormKey.Braise, days = 5),
            trophies = 2,
            dailyMission = GamePlayerBanner.DailyMission(done = 1, total = 3),
            season = GamePlayerBanner.Season(number = 1),
            treasury = TreasuryTierKey.Coffre,
        )
        assertThat(full.pieces).containsExactly(
            GamePlayerBanner.Piece.Rank, GamePlayerBanner.Piece.Level, GamePlayerBanner.Piece.Sparks,
            GamePlayerBanner.Piece.Meesh, GamePlayerBanner.Piece.League, GamePlayerBanner.Piece.Flame,
            GamePlayerBanner.Piece.Trophies, GamePlayerBanner.Piece.Mission, GamePlayerBanner.Piece.Treasury,
            GamePlayerBanner.Piece.Season,
        ).inOrder()

        val ready = banner(
            dailyMission = GamePlayerBanner.DailyMission(done = 3, total = 3),
            treasury = TreasuryTierKey.Coffre,
            attention = GameAttention(chestReady = true, flameAtRisk = false),
        )
        assertThat(ready.pieces).containsExactly(
            GamePlayerBanner.Piece.Level, GamePlayerBanner.Piece.Sparks, GamePlayerBanner.Piece.Mission,
            GamePlayerBanner.Piece.Offering, GamePlayerBanner.Piece.Treasury,
        ).inOrder()

        assertThat(banner(level = 1, score = 40).pieces).containsExactly(GamePlayerBanner.Piece.Sparks)
    }

    @Test
    fun `le contenant de l'Heritage se lit du bloc servi, et se tait sans Meesh gardee`() {
        val kept = GamePlayerBanner.of(served.copy(treasury = TreasuryStanding(held = 120, tier = TreasuryTierKey.Coffre)))
        assertThat(kept.treasury).isEqualTo(TreasuryTierKey.Coffre)
        assertThat(kept.pieces).contains(GamePlayerBanner.Piece.Treasury)

        val empty = GamePlayerBanner.of(served.copy(treasury = TreasuryStanding(held = 0, tier = null)))
        assertThat(empty.treasury).isNull()
        assertThat(empty.pieces).doesNotContain(GamePlayerBanner.Piece.Treasury)
    }

    @Test
    fun `le total montre est la poche, jamais le cycle`() {
        val game = served.copy(level = level(9, score = 8_200).copy(sparks = 5_000, sparksCycle = 8_200))
        assertThat(GamePlayerBanner.of(game).score).isEqualTo(5_000L)
        val older = served.copy(level = level(9, score = 8_200).copy(sparks = null))
        assertThat(GamePlayerBanner.of(older).score).isEqualTo(8_200L)
    }

    @Test
    fun `le niveau montre est celui que le rang ouvre`() {
        val shown = GamePlayerBanner.of(served)
        assertThat(shown.level).isEqualTo(142)
        assertThat(shown.nextLevel).isEqualTo(143)
        assertThat(shown.pointsToNext).isEqualTo(1_000L)
        assertThat(shown.percent).isEqualTo(25)
    }

    @Test
    fun `la mission du jour et la saison ne font jamais naitre un bandeau`() {
        val quiet = banner(
            level = 1, score = 0,
            dailyMission = GamePlayerBanner.DailyMission(done = 0, total = 3),
            season = GamePlayerBanner.Season(number = 1),
        )
        assertThat(quiet.hasAnythingToSay).isFalse()
    }

    @Test
    fun `toutes les donnees a zero, aucun bandeau`() {
        assertThat(GamePlayerBanner.make(nothing())).isNull()
    }

    @Test
    fun `le moindre morceau qui a du sens suffit a ouvrir le bandeau`() {
        assertThat(GamePlayerBanner.make(nothing(level = level(1, score = 12)))).isNotNull()
        assertThat(GamePlayerBanner.make(nothing(level = level(2, score = 0)))).isNotNull()
        assertThat(GamePlayerBanner.make(nothing(held = 1))).isNotNull()
        assertThat(GamePlayerBanner.make(nothing(glory = noGlory.copy(glory = 10)))).isNotNull()
        assertThat(GamePlayerBanner.make(nothing(flame = flame(3, FlameFormKey.Braise, FlameStatus.Lit)))).isNotNull()
    }

    @Test
    fun `une Flamme eteinte ou sans forme ne se montre pas`() {
        assertThat(GamePlayerBanner.make(nothing(flame = flame(3, FlameFormKey.Braise, FlameStatus.Out)))).isNull()
        assertThat(GamePlayerBanner.make(nothing(flame = flame(3, null, FlameStatus.Lit)))).isNull()
        val atRisk = GamePlayerBanner.make(nothing(flame = flame(3, FlameFormKey.Braise, FlameStatus.AtRisk)))
        assertThat(atRisk?.flame).isEqualTo(GamePlayerBanner.Flame(FlameFormKey.Braise, 3))
    }

    @Test
    fun `pas de points, pas de total ; niveau 1, ni anneau ni jauge`() {
        assertThat(GamePlayerBanner.make(nothing(held = 2))!!.showsScore).isFalse()
        assertThat(GamePlayerBanner.make(nothing(level = level(1, score = 40)))!!.showsScore).isTrue()
        assertThat(GamePlayerBanner.make(nothing(level = level(1, score = 40)))!!.showsLevel).isFalse()
        assertThat(GamePlayerBanner.make(nothing(level = level(2, score = 140)))!!.showsLevel).isTrue()
    }

    @Test
    fun `un Prestige ramene au niveau 1 mais garde ses etoiles, le detail reste`() {
        assertThat(GamePlayerBanner.make(nothing(level = level(1, score = 0, prestige = 1)))!!.showsLevel).isTrue()
    }

    @Test
    fun `pas de Meeshes, de Gloire ni de ligue, rien d'eux`() {
        val banner = GamePlayerBanner.make(nothing(level = level(5, score = 400)))!!
        assertThat(banner.meeshes).isNull()
        assertThat(banner.rank).isNull()
        assertThat(banner.league).isNull()
        assertThat(banner.flame).isNull()
    }

    @Test
    fun `une ligue ne se montre qu'ouverte et placee`() {
        val current = buildJsonObject {
            put("league", "jade"); put("groupId", "g1"); put("groupSize", 30); put("rank", 4); put("weekPoints", 120)
            put("zone", "safe")
        }
        val open = leagueBlock(access = "open", current = current)
        val shown = GamePlayerBanner.of(served.copy(league = open))
        assertThat(shown.league?.place).isEqualTo(4)
        assertThat(GamePlayerBanner.of(served.copy(league = leagueBlock("consent-required", current))).league).isNull()
        assertThat(GamePlayerBanner.of(served.copy(league = leagueBlock("open", null))).league).isNull()
    }

    @Test
    fun `un joueur complet garde tout`() {
        val banner = GamePlayerBanner.make(served)!!
        assertThat(banner.showsLevel && banner.showsScore).isTrue()
        assertThat(banner.meeshes).isEqualTo(12)
        assertThat(banner.rank?.glory).isEqualTo(70_000)
        assertThat(banner.rank?.division).isEqualTo(3)
        assertThat(banner.flame).isEqualTo(GamePlayerBanner.Flame(FlameFormKey.Flamme, 8))
        assertThat(banner.dailyMission).isEqualTo(GamePlayerBanner.DailyMission(done = 1, total = 2))
        assertThat(banner.attention.chestReady).isTrue()
    }

    @Test
    fun `une jauge recoit toujours une valeur entre 0 et 1`() {
        assertThat(banner().copy(progress = Double.NaN).boundedProgress).isEqualTo(0.0)
        assertThat(GamePlayerBanner.Rank(rank = GloryRank.entries.first(), division = 5, progress = 4.0).progress)
            .isEqualTo(1.0)
    }

    private fun leagueBlock(access: String, current: JsonObject?): GameLeagueBlock? {
        val league = buildJsonObject {
            put("unlocked", true); put("access", access); put("weekKey", "2026-11-16")
            put("closes", buildJsonObject { put("dayKey", "2026-11-22"); put("minuteOfDay", 1200) })
            if (current != null) put("current", current)
            put("friends", buildJsonObject { put("rank", 1); put("size", 3); put("weekPoints", 40) })
        }
        val block = GameBlockFixtures.block(overrides = mapOf("league" to league))
        return GameBlockParser.parse(block)?.league
    }
}
