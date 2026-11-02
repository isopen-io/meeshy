package me.meeshy.app.contacts.circles

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.CircleLevelIcons
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.ui.theme.MeeshyPalette

/** Le nom de repli d'un niveau, quand la table servie n'est pas là ; un niveau n'est jamais affiché par sa clé. */
@StringRes
internal fun RelationLevel.titleRes(): Int = when (this) {
    RelationLevel.BLOOD -> R.string.circles_level_blood
    RelationLevel.CLOSE -> R.string.circles_level_close
    RelationLevel.FRIEND -> R.string.circles_level_friend
    RelationLevel.ACQUAINTANCE -> R.string.circles_level_acquaintance
    RelationLevel.COMMUNITY -> R.string.circles_level_community
    RelationLevel.PUBLIC -> R.string.circles_level_public
}

/** Une couleur par niveau, tirée de la palette (aucune teinte codée en dur) — iso `CircleLevelColor` (iOS). */
internal fun RelationLevel.tint(): Color = when (this) {
    RelationLevel.BLOOD -> MeeshyPalette.Error
    RelationLevel.CLOSE -> MeeshyPalette.Warning
    RelationLevel.FRIEND -> MeeshyPalette.Success
    RelationLevel.ACQUAINTANCE -> MeeshyPalette.Info
    RelationLevel.COMMUNITY, RelationLevel.PUBLIC -> MeeshyPalette.Neutral500
}

/** Le libellé servi dans la langue de l'interface, sinon celui du catalogue local. */
@Composable
@ReadOnlyComposable
internal fun levelTitle(level: RelationLevel, config: RelationsConfig?): String {
    val language = LocalConfiguration.current.locales[0].language
    return config?.label(level, language) ?: stringResource(level.titleRes())
}

internal fun levelIcon(level: RelationLevel, config: RelationsConfig?): String =
    config?.icon(level) ?: CircleLevelIcons.of(level)

@StringRes
private fun CircleProgressSummary.MissingPiece.nounRes(): Int = when (this) {
    CircleProgressSummary.MissingPiece.AUDIO -> R.string.circles_missing_audio
    CircleProgressSummary.MissingPiece.MESSAGE -> R.string.circles_missing_message
    CircleProgressSummary.MissingPiece.REACTION -> R.string.circles_missing_reaction
    CircleProgressSummary.MissingPiece.POST_VIEW -> R.string.circles_missing_post_view
    CircleProgressSummary.MissingPiece.OTHER -> R.string.circles_missing_other
}

/**
 * La phrase de la ligne, ou `null` quand il n'y a rien à dire. « Semaines d'affilée : 3 sur 4 » plutôt que « 3 semaines
 * sur 4 » : la forme neutre ne dépend d'aucune règle de pluriel (l'arabe en compte six).
 */
@Composable
@ReadOnlyComposable
internal fun summaryText(summary: CircleProgressSummary, config: RelationsConfig?): String? = when (summary) {
    CircleProgressSummary.Silent -> null
    is CircleProgressSummary.Weeks -> stringResource(R.string.circles_progress_weeks, summary.done, summary.needed)
    is CircleProgressSummary.Eligible -> stringResource(R.string.circles_progress_eligible, levelTitle(summary.target, config))
    is CircleProgressSummary.Missing -> {
        val nouns = summary.pieces.map { stringResource(it.nounRes()) }
        stringResource(R.string.circles_progress_missing, nouns.joinToString(", "))
    }
}
