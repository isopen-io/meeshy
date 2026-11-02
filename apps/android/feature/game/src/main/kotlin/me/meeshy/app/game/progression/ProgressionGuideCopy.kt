package me.meeshy.app.game.progression

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.app.game.gameString
import me.meeshy.app.game.pages.count
import me.meeshy.app.game.pages.currentLocale
import me.meeshy.app.game.pages.languageName
import me.meeshy.app.game.pages.leagueNameRes
import me.meeshy.app.game.pages.points
import me.meeshy.app.game.pages.trophyTitle
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.guide.GameGuide
import me.meeshy.sdk.model.game.guide.GuideAction
import me.meeshy.sdk.model.game.guide.GuideActionV2
import me.meeshy.sdk.model.game.guide.GuideCard
import me.meeshy.sdk.model.game.guide.GuideContent
import me.meeshy.sdk.model.game.guide.GuideEvent
import me.meeshy.sdk.model.game.guide.GuideEventV2
import me.meeshy.sdk.model.game.pages.GameTrophyShelf
import me.meeshy.sdk.model.game.pages.SeasonPath
import me.meeshy.sdk.model.game.progression.ProgressionConceptModel
import me.meeshy.sdk.model.game.rules.GuideSpeaker
import me.meeshy.sdk.model.game.rules.OnboardingStepKey

/** Ce que dit une carte, en quatre temps et un bouton, plus sa version d'UNE ligne (iOS `GuideCopy`). */
internal data class GuideCopyText(val what: String, val means: String, val next: String, val short: String, val action: String)

/**
 * CE QUE DISENT MEE ET MEO (iOS `GameGuideCopy` et `GameText.guideMoment…`) — la loi choisit le moment et rend ses
 * chiffres ; ici seulement il devient des phrases, du catalogue iOS, dans les sept langues. Chaque nombre entre déjà
 * formaté par la locale.
 */
@Composable
internal fun guideCopy(card: GuideCard): GuideCopyText = when (val content = card.content) {
    is GuideContent.Moment -> momentCopy(content.moment.event, actionLabel(content.moment.action))
    is GuideContent.MomentV2 -> momentCopyV2(content.moment.event, actionLabel(content.moment.action))
    is GuideContent.Step -> stepCopy(content.step.key, actionLabel(GameGuide.action(content.step.key)))
}

@Composable
internal fun speakerName(speaker: GuideSpeaker): String = stringResource(
    when (speaker) {
        GuideSpeaker.Mee -> R.string.game_guide_speaker_mee
        GuideSpeaker.Meo -> R.string.game_guide_speaker_meo
        GuideSpeaker.Duo -> R.string.game_guide_speaker_duo
    },
)

@Composable
private fun actionLabel(action: GuideAction): String = stringResource(
    when (action) {
        GuideAction.StartGame -> R.string.game_guide_action_start_game
        GuideAction.EarnFirstPoints -> R.string.game_guide_action_earn_first_points
        GuideAction.SeeLevel -> R.string.game_guide_action_see_level
        GuideAction.SeeMissions -> R.string.game_guide_action_see_missions
        GuideAction.SeeFlame -> R.string.game_guide_action_see_flame
        GuideAction.SeeMeeshes -> R.string.game_guide_action_see_meeshes
        GuideAction.SeeRank -> R.string.game_guide_action_see_rank
        GuideAction.TakeStartPhoto -> R.string.game_guide_action_take_start_photo
        GuideAction.SeeProgress -> R.string.game_guide_action_see_progress
        GuideAction.SeeNextTier -> R.string.game_guide_action_see_next_tier
        GuideAction.OpenFirstMission -> R.string.game_guide_action_open_first_mission
        GuideAction.MintOrClimb -> R.string.game_guide_action_mint_or_climb
        GuideAction.SeeMintPreview -> R.string.game_guide_action_see_mint_preview
        GuideAction.TakePhoto -> R.string.game_guide_action_take_photo
        GuideAction.KeepOrSpend -> R.string.game_guide_action_keep_or_spend
        GuideAction.DoEasyMissionOrFreeze -> R.string.game_guide_action_do_easy_mission_or_freeze
        GuideAction.RelightFlame -> R.string.game_guide_action_relight_flame
        GuideAction.DoEasiestMission -> R.string.game_guide_action_do_easiest_mission
        GuideAction.PrestigeOrStay -> R.string.game_guide_action_prestige_or_stay
    },
)

@Composable
private fun actionLabel(action: GuideActionV2): String = when (action) {
    GuideActionV2.SeeLeague -> stringResource(R.string.game2_guide_action_see_league)
    GuideActionV2.SeeSeason -> stringResource(R.string.game2_guide_action_see_season)
    GuideActionV2.SeeTrophies -> stringResource(R.string.game2_guide_action_see_trophies)
    GuideActionV2.SeeAtlas -> stringResource(R.string.game2_guide_action_see_atlas)
    GuideActionV2.SeeLevel -> actionLabel(GuideAction.SeeLevel)
}

@Composable
private fun copy(what: Int, means: String, next: String, short: String, action: String) =
    GuideCopyText(stringResource(what), means, next, short, action)

@Composable
private fun momentCopy(event: GuideEvent, action: String): GuideCopyText = when (event) {
    is GuideEvent.FirstLevel -> {
        val toNext = points(event.pointsToNext.coerceIn(0, Int.MAX_VALUE.toLong()).toInt())
        copy(
            R.string.game_guide_moment_first_level_what,
            stringResource(R.string.game_guide_moment_first_level_means),
            stringResource(R.string.game_guide_moment_first_level_next, toNext, count(event.level + 1)),
            stringResource(R.string.game_guide_moment_first_level_short, count(event.level), toNext),
            action,
        )
    }
    is GuideEvent.NewTier -> {
        val name = gameString(GameCopyLaws.tierName(event.tier))
        GuideCopyText(
            stringResource(R.string.game_guide_moment_new_tier_what, name),
            stringResource(R.string.game_guide_moment_new_tier_means),
            event.nextTierLevel?.let { stringResource(R.string.game_guide_moment_new_tier_next, count(it)) }
                ?: stringResource(R.string.game_guide_moment_new_tier_next_last),
            stringResource(R.string.game_guide_moment_new_tier_short, name),
            action,
        )
    }
    GuideEvent.MissionsUnlocked -> copy(
        R.string.game_guide_moment_missions_unlocked_what,
        stringResource(R.string.game_guide_moment_missions_unlocked_means),
        stringResource(R.string.game_guide_moment_missions_unlocked_next),
        stringResource(R.string.game_guide_moment_missions_unlocked_short),
        action,
    )
    is GuideEvent.FirstMintPossible -> {
        val cost = points(event.price)
        val glory = count(event.gloryGain)
        copy(
            R.string.game_guide_moment_first_mint_possible_what,
            if (event.levelsLost > 0) {
                stringResource(R.string.game_guide_moment_first_mint_possible_means_drop, cost, glory)
            } else {
                stringResource(R.string.game_guide_moment_first_mint_possible_means_free, cost, glory)
            },
            stringResource(R.string.game_guide_moment_first_mint_possible_next),
            stringResource(R.string.game_guide_moment_first_mint_possible_short, cost),
            action,
        )
    }
    GuideEvent.FirstMint -> copy(
        R.string.game_guide_moment_first_mint_what,
        stringResource(R.string.game_guide_moment_first_mint_means),
        stringResource(R.string.game_guide_moment_first_mint_next),
        stringResource(R.string.game_guide_moment_first_mint_short),
        action,
    )
    is GuideEvent.PriceRises -> {
        val cost = points(event.nextPrice)
        copy(
            R.string.game_guide_moment_price_rises_what,
            stringResource(R.string.game_guide_moment_price_rises_means),
            stringResource(R.string.game_guide_moment_price_rises_next, cost),
            stringResource(R.string.game_guide_moment_price_rises_short, cost),
            action,
        )
    }
    is GuideEvent.NewRank -> {
        val name = gameString(ProgressionConceptModel.rankLabel(event.rank, event.division))
        GuideCopyText(
            stringResource(R.string.game_guide_moment_new_rank_what, name),
            stringResource(R.string.game_guide_moment_new_rank_means),
            event.gloryMissing?.let { stringResource(R.string.game_guide_moment_new_rank_next, count(it)) }
                ?: stringResource(R.string.game_guide_moment_new_rank_next_top),
            stringResource(R.string.game_guide_moment_new_rank_short, name),
            action,
        )
    }
    is GuideEvent.TreasuryTier -> {
        val name = gameString(GameCopyLaws.treasuryName(event.tier))
        GuideCopyText(
            stringResource(R.string.game_guide_moment_treasury_tier_what, name),
            stringResource(R.string.game_guide_moment_treasury_tier_means),
            event.nextTierMissing?.let { stringResource(R.string.game_guide_moment_treasury_tier_next, gameString(GameCopyLaws.meeshes(it))) }
                ?: stringResource(R.string.game_guide_moment_treasury_tier_next_top),
            stringResource(R.string.game_guide_moment_treasury_tier_short, name),
            action,
        )
    }
    is GuideEvent.FlameAtRisk -> copy(
        R.string.game_guide_moment_flame_at_risk_what,
        stringResource(R.string.game_guide_moment_flame_at_risk_means, gameString(GameCopyLaws.days(event.days))),
        stringResource(R.string.game_guide_moment_flame_at_risk_next),
        stringResource(R.string.game_guide_moment_flame_at_risk_short),
        action,
    )
    is GuideEvent.FlameOut -> {
        val price = gameString(GameCopyLaws.meeshes(event.relightPrice))
        copy(
            R.string.game_guide_moment_flame_out_what,
            stringResource(R.string.game_guide_moment_flame_out_means),
            if (event.canRelight) {
                stringResource(R.string.game_guide_moment_flame_out_next, price)
            } else {
                stringResource(R.string.game_guide_moment_flame_out_next_new)
            },
            if (event.canRelight) {
                stringResource(R.string.game_guide_moment_flame_out_short, price)
            } else {
                stringResource(R.string.game_guide_moment_flame_out_short_new)
            },
            action,
        )
    }
    is GuideEvent.ReturnAfterAbsence -> copy(
        R.string.game_guide_moment_return_after_absence_what,
        stringResource(R.string.game_guide_moment_return_after_absence_means, gameString(GameCopyLaws.days(event.daysAway))),
        stringResource(R.string.game_guide_moment_return_after_absence_next),
        stringResource(R.string.game_guide_moment_return_after_absence_short),
        action,
    )
    is GuideEvent.Level100 -> copy(
        R.string.game_guide_moment_level_100_what,
        stringResource(R.string.game_guide_moment_level_100_means),
        stringResource(if (event.canPrestige) R.string.game_guide_moment_level_100_next else R.string.game_guide_moment_level_100_next_stay),
        stringResource(R.string.game_guide_moment_level_100_short),
        action,
    )
}

@Composable
private fun momentCopyV2(event: GuideEventV2, action: String): GuideCopyText = when (event) {
    is GuideEventV2.LeagueFirst -> {
        val name = stringResource(leagueNameRes(event.league))
        val toNext = event.pointsToPromotion?.let { points(it) }
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_league_first_what, name),
            stringResource(R.string.game2_guide_moment_league_first_means),
            toNext?.let { stringResource(R.string.game2_guide_moment_league_first_next, it) }
                ?: stringResource(R.string.game2_guide_moment_league_first_next_top),
            toNext?.let { stringResource(R.string.game2_guide_moment_league_first_short, name, it) }
                ?: stringResource(R.string.game2_league_at_top),
            action,
        )
    }
    is GuideEventV2.LeaguePromoted -> {
        val name = stringResource(leagueNameRes(event.to))
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_league_promoted_what, name),
            stringResource(R.string.game2_guide_moment_league_promoted_means, count(event.rank), stringResource(leagueNameRes(event.from))),
            stringResource(R.string.game2_guide_moment_league_promoted_next),
            stringResource(R.string.game2_guide_moment_league_promoted_short, name),
            action,
        )
    }
    is GuideEventV2.LeagueRelegated -> {
        val name = stringResource(leagueNameRes(event.to))
        val missing = event.pointsToPromotion ?: 0
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_league_relegated_what, name),
            stringResource(R.string.game2_guide_moment_league_relegated_means),
            if (missing > 0) {
                stringResource(R.string.game2_guide_moment_league_relegated_next, points(missing))
            } else {
                stringResource(R.string.game2_guide_moment_league_relegated_next_far)
            },
            stringResource(R.string.game2_guide_moment_league_relegated_short, name),
            action,
        )
    }
    is GuideEventV2.SeasonStart -> {
        val season = count(event.season)
        val theme = SeasonPath.themeLanguage(event.themeKey)?.let { languageName(it, currentLocale()) }
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_season_start_what, season),
            theme?.let { stringResource(R.string.game2_guide_moment_season_start_means, it) }
                ?: stringResource(R.string.game2_guide_moment_season_start_means_plain),
            stringResource(R.string.game2_guide_moment_season_start_next, count(event.steps)),
            stringResource(R.string.game2_guide_moment_season_start_short, season),
            action,
        )
    }
    is GuideEventV2.SeasonEnd -> {
        val season = count(event.season)
        GuideCopyText(
            if (event.completed) {
                stringResource(R.string.game2_guide_moment_season_end_what_done, season)
            } else {
                stringResource(R.string.game2_guide_moment_season_end_what, season)
            },
            if (event.completed) {
                stringResource(R.string.game2_guide_moment_season_end_means_done, count(event.gloryGained))
            } else {
                stringResource(R.string.game2_guide_moment_season_end_means, count(event.stepsReached))
            },
            stringResource(R.string.game2_guide_moment_season_end_next),
            stringResource(R.string.game2_guide_moment_season_end_short, season),
            action,
        )
    }
    is GuideEventV2.Trophy -> {
        val what = stringResource(R.string.game2_guide_moment_trophy_what)
        val title = GameTrophyShelf.parse(event.trophyKey)?.let { trophyTitle(it, currentLocale()) } ?: what
        GuideCopyText(
            what,
            stringResource(R.string.game2_guide_moment_trophy_means, title),
            stringResource(R.string.game2_guide_moment_trophy_next),
            stringResource(R.string.game2_guide_moment_trophy_short, title),
            action,
        )
    }
    is GuideEventV2.Prestige -> {
        val number = count(event.prestige)
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_prestige_what, number),
            stringResource(R.string.game2_guide_moment_prestige_means, count(event.gloryGained)),
            stringResource(R.string.game2_guide_moment_prestige_next),
            stringResource(R.string.game2_guide_moment_prestige_short, number),
            action,
        )
    }
    is GuideEventV2.AtlasStamp -> {
        val name = languageName(event.language, currentLocale())
        GuideCopyText(
            stringResource(R.string.game2_guide_moment_atlas_stamp_what, name),
            stringResource(R.string.game2_guide_moment_atlas_stamp_means),
            stringResource(R.string.game2_guide_moment_atlas_stamp_next, count(event.stamped), count(event.total)),
            stringResource(R.string.game2_guide_moment_atlas_stamp_short, name),
            action,
        )
    }
}

/** Une étape de l'intégration : sa phrase forte EST sa version courte (iOS `GameGuideCopy.step`). */
@Composable
private fun stepCopy(key: OnboardingStepKey, action: String): GuideCopyText {
    val text = RulesBookCopy.step(key)
    val what = stringResource(text.what)
    return GuideCopyText(what, stringResource(text.means), stringResource(text.next), what, action)
}
