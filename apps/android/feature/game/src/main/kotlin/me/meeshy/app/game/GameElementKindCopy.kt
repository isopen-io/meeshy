package me.meeshy.app.game

import androidx.annotation.StringRes
import me.meeshy.app.game.progression.ConceptCopy
import me.meeshy.app.game.progression.GameDetailFactCopy
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.element.GameElementDetail
import me.meeshy.sdk.model.game.element.GameElementHow
import me.meeshy.sdk.model.game.element.GameElementKind

/** Les deux phrases de chaque famille (`game.detail.<famille>.what` / `.how`) : les mêmes clés qu'iOS et le web. */
internal object GameElementKindCopy {

    @StringRes
    fun what(kind: GameElementKind): Int? = when (kind) {
        GameElementKind.Badge -> R.string.game_detail_badge_what
        GameElementKind.Achievement -> R.string.game_detail_succes_what
        GameElementKind.Challenge -> R.string.game_detail_defi_what
        GameElementKind.Trophy -> R.string.game_detail_trophy_what
        GameElementKind.Stamp -> R.string.game_detail_stamp_what
        GameElementKind.SeasonStep -> R.string.game_detail_step_what
        GameElementKind.Seal -> R.string.game_detail_seal_what
        GameElementKind.LeagueGem -> R.string.game_detail_gem_what
        GameElementKind.PrestigeStar -> R.string.game_detail_star_what
        GameElementKind.Rank -> R.string.game_detail_rank_what
        GameElementKind.FlameForm -> R.string.game_detail_flame_what
        GameElementKind.Freeze -> R.string.game_detail_freeze_what
        GameElementKind.Mission -> R.string.game_detail_mission_what
        GameElementKind.Chest -> R.string.game_detail_chest_what
        GameElementKind.Coin -> R.string.game_detail_coin_what
        GameElementKind.LevelRing -> R.string.game_detail_ring_what
        GameElementKind.TreasuryTier -> R.string.game_detail_treasury_what
        GameElementKind.ElanFamily -> R.string.game_detail_elan_what
        GameElementKind.LevelStep -> R.string.game_detail_levelstep_what
        GameElementKind.Fact -> null
        GameElementKind.Player -> R.string.game_detail_player_what
    }

    @StringRes
    fun how(kind: GameElementKind): Int? = when (kind) {
        GameElementKind.Badge -> R.string.game_detail_badge_how
        GameElementKind.Achievement -> R.string.game_detail_succes_how
        GameElementKind.Challenge -> R.string.game_detail_defi_how
        GameElementKind.Trophy -> R.string.game_detail_trophy_how
        GameElementKind.Stamp -> R.string.game_detail_stamp_how
        GameElementKind.SeasonStep -> R.string.game_detail_step_how
        GameElementKind.Seal -> R.string.game_detail_seal_how
        GameElementKind.LeagueGem -> R.string.game_detail_gem_how
        GameElementKind.PrestigeStar -> R.string.game_detail_star_how
        GameElementKind.Rank -> R.string.game_detail_rank_how
        GameElementKind.FlameForm -> R.string.game_detail_flame_how
        GameElementKind.Freeze -> R.string.game_detail_freeze_how
        GameElementKind.Mission -> R.string.game_detail_mission_how
        GameElementKind.Chest -> R.string.game_detail_chest_how
        GameElementKind.Coin -> R.string.game_detail_coin_how
        GameElementKind.LevelRing -> R.string.game_detail_ring_how
        GameElementKind.TreasuryTier -> R.string.game_detail_treasury_how
        GameElementKind.ElanFamily -> R.string.game_detail_elan_how
        GameElementKind.LevelStep -> R.string.game_detail_levelstep_how
        GameElementKind.Fact, GameElementKind.Player -> null
    }

    /** « C'est quoi » : la phrase de la famille ; d'une donnée, SA phrase, ou à défaut celle de son concept. */
    @StringRes
    fun what(detail: GameElementDetail): Int = when (detail.kind) {
        GameElementKind.Fact -> detail.factKey?.let(GameDetailFactCopy::sentence) ?: ConceptCopy.what(detail.concept)
        else -> what(detail.kind) ?: ConceptCopy.what(detail.concept)
    }

    @StringRes
    fun howTitle(kind: GameElementKind): Int =
        if (kind.how == GameElementHow.Gives) R.string.game_detail_gives_label else R.string.game_detail_obtain_label
}
