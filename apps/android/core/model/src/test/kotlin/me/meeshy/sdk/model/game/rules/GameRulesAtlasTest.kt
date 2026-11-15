package me.meeshy.sdk.model.game.rules

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.FlameFormKey
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.engagement.RarityBorder
import org.junit.Test

/** L'atlas illustré du carnet, à l'iso d'iOS `GameRulesAtlas` (#9538, #13895) : quelles familles, dans quel ordre, quoi dessiner. */
class GameRulesAtlasTest {

    @Test
    fun `nine families in the order of the design document, Mee and Meo taking turns`() {
        assertThat(GameRulesAtlas.families.map { it.wire }).containsExactly(
            "tiers", "coin", "treasury", "ranks", "flames", "leagues", "medals", "trophies", "rarities",
        ).inOrder()
        assertThat(GameRulesAtlas.families.map { it.speaker }).containsExactly(
            GuideSpeaker.Mee, GuideSpeaker.Meo, GuideSpeaker.Mee, GuideSpeaker.Meo, GuideSpeaker.Mee,
            GuideSpeaker.Meo, GuideSpeaker.Mee, GuideSpeaker.Meo, GuideSpeaker.Mee,
        ).inOrder()
    }

    @Test
    fun `twenty tiers, each with the first level it covers`() {
        val tiers = GameRulesAtlas.plates(AtlasFamily.Tiers).filterIsInstance<AtlasPlate.Tier>()
        assertThat(tiers.map { it.tier }).containsExactlyElementsIn(LevelTierKey.entries).inOrder()
        assertThat(tiers.map { it.firstLevel }).containsExactly(
            1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 101, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
        ).inOrder()
    }

    @Test
    fun `the level rules say how far each rank opens the levels, then the rebirth and first-pass glory`() {
        assertThat(GameRulesAtlas.levelRules).containsExactly(
            AtlasLevelRule.CapBase(level = 499, opening = GloryRank.Ambassadeur),
            AtlasLevelRule.CapRanks(level = 1000, from = GloryRank.Ambassadeur, to = GloryRank.Orateur),
            AtlasLevelRule.CapNone(from = GloryRank.Oracle),
            AtlasLevelRule.Prestige(level = 100),
            AtlasLevelRule.FirstPassGlory(perLevel = 100, upTo = 100, perDecade = 1000),
        ).inOrder()
    }

    @Test
    fun `the coin shows obverse, reverse, gold every hundredth and prism every thousandth`() {
        val plates = GameRulesAtlas.plates(AtlasFamily.Coin).filterIsInstance<AtlasPlate.Coin>().map { it.plate }
        assertThat(plates).containsExactly(AtlasCoinPlate.Obverse, AtlasCoinPlate.Reverse, AtlasCoinPlate.Gold, AtlasCoinPlate.Prism).inOrder()
        assertThat(plates.map { Triple(it.isReverse, it.edition, it.number) }).containsExactly(
            Triple(false, MeeshEdition.Silver, 13),
            Triple(true, MeeshEdition.Silver, 13),
            Triple(true, MeeshEdition.Gold, 100),
            Triple(true, MeeshEdition.Prism, 1000),
        ).inOrder()
    }

    @Test
    fun `the treasury draws one more coin at each of its six tiers`() {
        val tiers = GameRulesAtlas.plates(AtlasFamily.Treasury).filterIsInstance<AtlasPlate.Treasury>()
        assertThat(tiers.map { it.tier }).containsExactlyElementsIn(TreasuryTierKey.entries).inOrder()
        assertThat(tiers.map { it.pile }).containsExactly(1, 2, 3, 4, 5, 6).inOrder()
        assertThat(tiers.map { it.minHeld }).containsExactly(1, 10, 50, 100, 500, 1000).inOrder()
    }

    @Test
    fun `eleven blazons at their lowest division, Myth without division nor threshold`() {
        val ranks = GameRulesAtlas.plates(AtlasFamily.Ranks).filterIsInstance<AtlasPlate.Rank>()
        assertThat(ranks.map { it.rank }).containsExactlyElementsIn(GloryRank.entries).inOrder()
        assertThat(ranks.dropLast(1).map { it.division5 }.toSet()).containsExactly(5)
        assertThat(ranks.last().division5).isNull()
        assertThat(ranks.last().minGlory).isNull()
        assertThat(ranks.first().minGlory).isEqualTo(0)
        assertThat(ranks.dropLast(1).map { it.minGlory }).isInStrictOrder()
    }

    @Test
    fun `five flames read their first day from the law, the ember alone without a plus`() {
        val flames = GameRulesAtlas.plates(AtlasFamily.Flames).filterIsInstance<AtlasPlate.Flame>()
        assertThat(flames.map { it.form }).containsExactlyElementsIn(FlameFormKey.entries).inOrder()
        assertThat(flames.map { it.minDays }).containsExactly(1, 7, 30, 100, 365).inOrder()
        assertThat(flames.map { it.andMore }).containsExactly(false, true, true, true, true).inOrder()
    }

    @Test
    fun `eight leagues from Quartz to Prism`() {
        val leagues = GameRulesAtlas.plates(AtlasFamily.Leagues).filterIsInstance<AtlasPlate.League>()
        assertThat(leagues.map { it.league }).containsExactlyElementsIn(LeagueKey.entries).inOrder()
    }

    @Test
    fun `the medals show three shapes, seven materials with their thresholds, then the imprint`() {
        val plates = GameRulesAtlas.plates(AtlasFamily.Medals)
        assertThat(plates.filterIsInstance<AtlasPlate.MedalShape>().map { it.shape }).containsExactly(
            AtlasMedalShape.Accumulation, AtlasMedalShape.Record, AtlasMedalShape.Collection,
        ).inOrder()
        assertThat(AtlasMedalShape.entries.map { it.material }).containsExactly(GameMaterial.Gold, GameMaterial.Platinum, GameMaterial.Prism).inOrder()
        assertThat(AtlasMedalShape.entries.map { it.label }).containsExactly("100", "100", null).inOrder()
        assertThat(plates.filterIsInstance<AtlasPlate.MedalMaterial>().map { it.material to it.threshold }).containsExactly(
            GameMaterial.Copper to 1, GameMaterial.Bronze to 10, GameMaterial.Silver to 50, GameMaterial.Gold to 100,
            GameMaterial.Platinum to 500, GameMaterial.Obsidian to 1000, GameMaterial.Prism to 5000,
        ).inOrder()
        assertThat(plates.last()).isEqualTo(AtlasPlate.MedalImprint)
        assertThat(plates).hasSize(11)
    }

    @Test
    fun `the trophies are the three league cups, the season cup, the crowned rebirth trophy and the flame trophy`() {
        val plates = GameRulesAtlas.plates(AtlasFamily.Trophies).filterIsInstance<AtlasPlate.Trophy>().map { it.plate }
        assertThat(plates.map { it.material }).containsExactly(
            GameMaterial.Gold, GameMaterial.Silver, GameMaterial.Bronze, GameMaterial.Platinum, GameMaterial.Prism, GameMaterial.Flame,
        ).inOrder()
        assertThat(plates.filter { it.isLeagueCup }).containsExactly(AtlasTrophyPlate.LeagueGold, AtlasTrophyPlate.LeagueSilver, AtlasTrophyPlate.LeagueBronze)
        assertThat(plates.filter { it.crowned }).containsExactly(AtlasTrophyPlate.Prestige)
    }

    @Test
    fun `five rarities with their rim and the glory they bring`() {
        val rarities = GameRulesAtlas.plates(AtlasFamily.Rarities).filterIsInstance<AtlasPlate.Rarity>()
        assertThat(rarities.map { it.rarity }).containsExactlyElementsIn(AchievementRarity.entries).inOrder()
        assertThat(rarities.map { it.border }).containsExactly(
            RarityBorder.Slate, RarityBorder.Blue, RarityBorder.Violet, RarityBorder.Gold, RarityBorder.Prism,
        ).inOrder()
        assertThat(rarities.map { it.glory }).containsExactly(100, 250, 600, 1500, 4000).inOrder()
    }

    @Test
    fun `every plate carries an identity unique across the atlas`() {
        val ids = GameRulesAtlas.families.flatMap { family -> GameRulesAtlas.plates(family).map { "${family.wire}.${it.id}" } }
        assertThat(ids).containsNoDuplicates()
        assertThat(ids).hasSize(20 + 4 + 6 + 11 + 5 + 8 + 11 + 6 + 5)
    }
}
