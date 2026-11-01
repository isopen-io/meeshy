package me.meeshy.app.game.notebook

import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import me.meeshy.app.game.gameString
import me.meeshy.feature.game.R
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.PhotoStepEmblem

/*
 * Les deux lignes d'un moment de la Chronique (iOS `GamePhotoMoments` + `GamePhotoCatchUp.moment(of:)`) : la ligne du
 * dessus (« Nouveau rang ») et la ligne forte (« Voix II »), tirées du catalogue iOS.
 */

@Composable
private fun count(value: Int): String = GameNumberFormat.formatCount(value, LocalConfiguration.current.locales[0])

@Composable
internal fun photoMomentKicker(emblem: PhotoStepEmblem): String = when (emblem) {
    PhotoStepEmblem.Start -> stringResource(R.string.game_photo_kicker_start)
    is PhotoStepEmblem.Rank -> stringResource(R.string.game_photo_kicker_rank)
    is PhotoStepEmblem.Tier -> stringResource(R.string.game_photo_kicker_tier, count(emblem.level))
    PhotoStepEmblem.LevelHundred -> stringResource(R.string.game_photo_kicker_summit)
    is PhotoStepEmblem.Prestige -> stringResource(R.string.game2_photo_kicker_prestige)
    is PhotoStepEmblem.Meesh -> stringResource(R.string.game_photo_kicker_meesh)
    is PhotoStepEmblem.Treasury -> stringResource(R.string.game_photo_kicker_treasury)
    is PhotoStepEmblem.Flame -> stringResource(R.string.game_photo_kicker_flame)
}

@Composable
internal fun photoMomentTitle(emblem: PhotoStepEmblem): String = when (emblem) {
    PhotoStepEmblem.Start -> stringResource(R.string.game_photo_title_start)
    is PhotoStepEmblem.Rank -> rankTitle(emblem)
    is PhotoStepEmblem.Tier -> tierTitle(emblem)
    PhotoStepEmblem.LevelHundred -> stringResource(R.string.game_photo_title_level_100)
    is PhotoStepEmblem.Prestige -> stringResource(R.string.game_photo_title_prestige, count(emblem.number))
    is PhotoStepEmblem.Meesh -> meeshTitle(emblem)
    is PhotoStepEmblem.Treasury -> gameString(GameCopyLaws.treasuryName(emblem.tier))
    is PhotoStepEmblem.Flame -> stringResource(R.string.game_photo_title_flame_days, count(emblem.days))
}

/** Le rang et sa division V–I (iOS `GameCopy.rankLabel`) ; le Mythe, sans place connue ici, dit son nom. */
@Composable
private fun rankTitle(emblem: PhotoStepEmblem.Rank): String {
    val name = gameString(GameCopyLaws.rankName(emblem.rank))
    val roman = emblem.division?.let { ROMANS.getOrNull(it - 1) } ?: return name
    return "$name $roman"
}

/** « Ta lumière en Lueur », puis « ×2 » quand le palier a été atteint dans plusieurs cycles (#10911). */
@Composable
private fun tierTitle(emblem: PhotoStepEmblem.Tier): String {
    val title = stringResource(R.string.game_photo_title_tier, gameString(GameCopyLaws.tierName(emblem.tier)))
    return if (emblem.times >= 2) "$title ×${count(emblem.times)}" else title
}

@Composable
private fun meeshTitle(emblem: PhotoStepEmblem.Meesh): String = when {
    emblem.number == 1 -> stringResource(R.string.game_photo_title_meesh_first)
    emblem.edition == MeeshEdition.Silver -> stringResource(R.string.game_photo_title_meesh_number, count(emblem.number))
    else -> stringResource(
        R.string.game_photo_title_meesh_number_edition,
        count(emblem.number),
        gameString(GameCopyLaws.editionName(emblem.edition)),
    )
}

private val ROMANS = listOf("I", "II", "III", "IV", "V")
