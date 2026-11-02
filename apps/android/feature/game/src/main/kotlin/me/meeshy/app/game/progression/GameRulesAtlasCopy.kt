package me.meeshy.app.game.progression

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.leagueNameRes
import me.meeshy.app.game.reveal.RevealCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.rules.AtlasCoinPlate
import me.meeshy.sdk.model.game.rules.AtlasFamily
import me.meeshy.sdk.model.game.rules.AtlasLevelRule
import me.meeshy.sdk.model.game.rules.AtlasMedalShape
import me.meeshy.sdk.model.game.rules.AtlasPlate
import me.meeshy.sdk.model.game.rules.AtlasTrophyPlate

/** Le nom d'un objet de l'atlas et sa ligne discrète (`null` quand iOS n'en dit pas). */
internal data class AtlasLegend(val name: String, val detail: String?)

/** Le titre d'une famille et la ligne que Mee ou Meo y dit. */
internal data class AtlasFamilyCopy(@StringRes val title: Int, @StringRes val line: Int)

/** Ce que l'atlas DIT (iOS `GameAtlasCopy`) : titres et lignes des familles, légendes des objets, règle des niveaux. */
internal object AtlasCopy {

    fun family(family: AtlasFamily): AtlasFamilyCopy = when (family) {
        AtlasFamily.Tiers -> AtlasFamilyCopy(R.string.game_atlas_tiers_title, R.string.game_atlas_tiers_line)
        AtlasFamily.Coin -> AtlasFamilyCopy(R.string.game_atlas_coin_title, R.string.game_atlas_coin_line)
        AtlasFamily.Treasury -> AtlasFamilyCopy(R.string.game_atlas_treasury_title, R.string.game_atlas_treasury_line)
        AtlasFamily.Ranks -> AtlasFamilyCopy(R.string.game_atlas_ranks_title, R.string.game_atlas_ranks_line)
        AtlasFamily.Flames -> AtlasFamilyCopy(R.string.game_atlas_flames_title, R.string.game_atlas_flames_line)
        AtlasFamily.Leagues -> AtlasFamilyCopy(R.string.game_atlas_leagues_title, R.string.game_atlas_leagues_line)
        AtlasFamily.Medals -> AtlasFamilyCopy(R.string.game_atlas_medals_title, R.string.game_atlas_medals_line)
        AtlasFamily.Trophies -> AtlasFamilyCopy(R.string.game_atlas_trophies_title, R.string.game_atlas_trophies_line)
        AtlasFamily.Rarities -> AtlasFamilyCopy(R.string.game_atlas_rarities_title, R.string.game_atlas_rarities_line)
    }

    @StringRes
    fun coin(plate: AtlasCoinPlate): Int = when (plate) {
        AtlasCoinPlate.Obverse -> R.string.game_atlas_coin_obverse
        AtlasCoinPlate.Reverse -> R.string.game_atlas_coin_reverse
        AtlasCoinPlate.Gold -> R.string.game_atlas_coin_gold
        AtlasCoinPlate.Prism -> R.string.game_atlas_coin_prism
    }

    @StringRes
    fun shape(shape: AtlasMedalShape): Int = when (shape) {
        AtlasMedalShape.Accumulation -> R.string.game_atlas_medals_accumulation
        AtlasMedalShape.Record -> R.string.game_atlas_medals_record
        AtlasMedalShape.Collection -> R.string.game_atlas_medals_collection
    }

    @StringRes
    fun trophy(plate: AtlasTrophyPlate): Int = when (plate) {
        AtlasTrophyPlate.LeagueGold, AtlasTrophyPlate.LeagueSilver, AtlasTrophyPlate.LeagueBronze -> R.string.game_atlas_trophy_league
        AtlasTrophyPlate.Season -> R.string.game_atlas_trophy_season
        AtlasTrophyPlate.Prestige -> R.string.game_atlas_trophy_prestige
        AtlasTrophyPlate.Flame -> R.string.game_atlas_trophy_flame
    }

    @StringRes
    fun share(rarity: AchievementRarity): Int = when (rarity) {
        AchievementRarity.Common -> R.string.game_atlas_rarity_common
        AchievementRarity.Rare -> R.string.game_atlas_rarity_rare
        AchievementRarity.Epic -> R.string.game_atlas_rarity_epic
        AchievementRarity.Legendary -> R.string.game_atlas_rarity_legendary
        AchievementRarity.Mythic -> R.string.game_atlas_rarity_mythic
    }

    @Composable
    fun legend(plate: AtlasPlate): AtlasLegend = when (plate) {
        is AtlasPlate.Tier -> AtlasLegend(gameString(GameCopyLaws.tierName(plate.tier)), stringResource(R.string.game_hero_level, count(plate.firstLevel)))
        is AtlasPlate.Coin -> AtlasLegend(stringResource(coin(plate.plate)), null)
        is AtlasPlate.Treasury -> AtlasLegend(gameString(GameCopyLaws.treasuryName(plate.tier)), count(plate.minHeld) + "+")
        is AtlasPlate.Rank -> AtlasLegend(
            gameString(GameCopyLaws.rankName(plate.rank)),
            plate.minGlory?.let { gameString(GameCopyLaws.gloryAmount(GameTextArg.Count(it))) } ?: stringResource(R.string.game_atlas_ranks_myth),
        )
        is AtlasPlate.Flame -> AtlasLegend(
            gameString(GameCopyLaws.flameFormName(plate.form)),
            gameString(GameCopyLaws.days(plate.minDays)) + if (plate.andMore) "+" else "",
        )
        is AtlasPlate.League -> AtlasLegend(stringResource(leagueNameRes(plate.league)), null)
        is AtlasPlate.MedalShape -> AtlasLegend(stringResource(shape(plate.shape)), null)
        is AtlasPlate.MedalMaterial -> AtlasLegend(gameString(GameCopyLaws.materialName(plate.material)), gameString(GameCopyLaws.actions(plate.threshold)))
        AtlasPlate.MedalImprint -> AtlasLegend(stringResource(R.string.game_atlas_medals_imprint), null)
        is AtlasPlate.Trophy -> AtlasLegend(
            stringResource(trophy(plate.plate)),
            if (plate.plate.isLeagueCup) gameString(GameCopyLaws.materialName(plate.plate.material)) else null,
        )
        is AtlasPlate.Rarity -> AtlasLegend(
            RevealCopy.rarityName(LocalContext.current.resources, plate.rarity),
            stringResource(share(plate.rarity)) + " · " + stringResource(R.string.game_mint_chip_glory, count(plate.glory)),
        )
    }

    @Composable
    fun levelRule(rule: AtlasLevelRule): String = when (rule) {
        is AtlasLevelRule.CapBase -> stringResource(R.string.game_atlas_tiers_cap_base, count(rule.level), rank(rule.opening))
        is AtlasLevelRule.CapOne -> stringResource(R.string.game_atlas_tiers_cap_one, count(rule.level), rank(rule.rank))
        is AtlasLevelRule.CapRanks -> stringResource(R.string.game_atlas_tiers_cap_ranks, count(rule.level), rank(rule.from), rank(rule.to))
        is AtlasLevelRule.CapNone -> stringResource(R.string.game_atlas_tiers_cap_none, rank(rule.from))
        is AtlasLevelRule.Prestige -> stringResource(R.string.game_atlas_tiers_prestige, count(rule.level))
        is AtlasLevelRule.FirstPassGlory ->
            stringResource(R.string.game_atlas_tiers_glory, count(rule.perLevel), count(rule.upTo), count(rule.perDecade))
    }

    @Composable
    private fun rank(rank: GloryRank): String = gameString(GameCopyLaws.rankName(rank))

    @Composable
    private fun count(value: Int): String = GameNumberFormat.formatCount(value, LocalConfiguration.current.locales[0])
}
