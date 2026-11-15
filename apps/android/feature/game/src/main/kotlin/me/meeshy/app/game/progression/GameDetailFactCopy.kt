package me.meeshy.app.game.progression

import androidx.annotation.StringRes
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.progression.GameDetailFactKey

/** La phrase d'une donnée (iOS `GameDetailText.fact`) : `game.detail.fact.<donnée>`, adoptée du catalogue iOS. */
internal object GameDetailFactCopy {

    @StringRes
    fun sentence(key: GameDetailFactKey): Int = when (key) {
        GameDetailFactKey.Tier -> R.string.game_detail_fact_tier
        GameDetailFactKey.Score -> R.string.game_detail_fact_score
        GameDetailFactKey.Convertible -> R.string.game_detail_fact_convertible
        GameDetailFactKey.LevelNext -> R.string.game_detail_fact_level_next
        GameDetailFactKey.LevelRecord -> R.string.game_detail_fact_level_record
        GameDetailFactKey.Tailwind -> R.string.game_detail_fact_tailwind
        GameDetailFactKey.MintPrice -> R.string.game_detail_fact_mint_price
        GameDetailFactKey.MintMissing -> R.string.game_detail_fact_mint_missing
        GameDetailFactKey.CanMint -> R.string.game_detail_fact_can_mint
        GameDetailFactKey.Factor -> R.string.game_detail_fact_factor
        GameDetailFactKey.MintNext -> R.string.game_detail_fact_mint_next
        GameDetailFactKey.MintGlory -> R.string.game_detail_fact_mint_glory
        GameDetailFactKey.Minted -> R.string.game_detail_fact_minted
        GameDetailFactKey.Glory -> R.string.game_detail_fact_glory
        GameDetailFactKey.GloryMissing -> R.string.game_detail_fact_glory_missing
        GameDetailFactKey.Streak -> R.string.game_detail_fact_streak
        GameDetailFactKey.StreakRecord -> R.string.game_detail_fact_streak_record
        GameDetailFactKey.FlameState -> R.string.game_detail_fact_flame_state
        GameDetailFactKey.MissionsDone -> R.string.game_detail_fact_missions_done
        GameDetailFactKey.LeaguePlace -> R.string.game_detail_fact_league_place
        GameDetailFactKey.WeekPoints -> R.string.game_detail_fact_week_points
        GameDetailFactKey.LeagueZone -> R.string.game_detail_fact_league_zone
        GameDetailFactKey.LeagueMissing -> R.string.game_detail_fact_league_missing
        GameDetailFactKey.LeagueCloses -> R.string.game_detail_fact_league_closes
        GameDetailFactKey.LeagueFriends -> R.string.game_detail_fact_league_friends
        GameDetailFactKey.Season -> R.string.game_detail_fact_season
        GameDetailFactKey.SeasonWeek -> R.string.game_detail_fact_season_week
        GameDetailFactKey.SeasonSteps -> R.string.game_detail_fact_season_steps
        GameDetailFactKey.SeasonStars -> R.string.game_detail_fact_season_stars
        GameDetailFactKey.PrestigeGlory -> R.string.game_detail_fact_prestige_glory
        GameDetailFactKey.ElanFamilies -> R.string.game_detail_fact_elan_families
        GameDetailFactKey.BadgesEarned -> R.string.game_detail_fact_badges_earned
        GameDetailFactKey.DefisEarned -> R.string.game_detail_fact_defis_earned
        GameDetailFactKey.SuccesEarned -> R.string.game_detail_fact_succes_earned
        GameDetailFactKey.Trophies -> R.string.game_detail_fact_trophies
        GameDetailFactKey.ShowcaseVisibility -> R.string.game_detail_fact_showcase_visibility
        GameDetailFactKey.AtlasStamps -> R.string.game_detail_fact_atlas_stamps
        GameDetailFactKey.AtlasPending -> R.string.game_detail_fact_atlas_pending
        GameDetailFactKey.SpendHeld -> R.string.game_detail_fact_spend_held
        GameDetailFactKey.SpendCost -> R.string.game_detail_fact_spend_cost
        GameDetailFactKey.SpendAfter -> R.string.game_detail_fact_spend_after
        GameDetailFactKey.SpendMissing -> R.string.game_detail_fact_spend_missing
        GameDetailFactKey.LevelNow -> R.string.game_detail_fact_level_now
        GameDetailFactKey.LevelRequired -> R.string.game_detail_fact_level_required
    }
}
