package me.meeshy.ui.component.circles

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationRaiseOffer
import me.meeshy.ui.theme.MeeshyTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import me.meeshy.ui.R
import me.meeshy.sdk.model.relation.CircleLevelIcons
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.ui.theme.MeeshyPalette

/** Le nom de repli d'un niveau, quand la table servie n'est pas là ; un niveau n'est jamais affiché par sa clé. */
@StringRes
public fun RelationLevel.titleRes(): Int = when (this) {
    RelationLevel.BLOOD -> R.string.circles_level_blood
    RelationLevel.CLOSE -> R.string.circles_level_close
    RelationLevel.FRIEND -> R.string.circles_level_friend
    RelationLevel.ACQUAINTANCE -> R.string.circles_level_acquaintance
    RelationLevel.COMMUNITY -> R.string.circles_level_community
    RelationLevel.PUBLIC -> R.string.circles_level_public
}

/** Une couleur par niveau, tirée de la palette (aucune teinte codée en dur) — iso `CircleLevelColor` (iOS). */
public fun RelationLevel.tint(): Color = when (this) {
    RelationLevel.BLOOD -> MeeshyPalette.Error
    RelationLevel.CLOSE -> MeeshyPalette.Warning
    RelationLevel.FRIEND -> MeeshyPalette.Success
    RelationLevel.ACQUAINTANCE -> MeeshyPalette.Info
    RelationLevel.COMMUNITY, RelationLevel.PUBLIC -> MeeshyPalette.Neutral500
}

/** Le libellé servi dans la langue de l'interface, sinon celui du catalogue local. */
@Composable
@ReadOnlyComposable
public fun levelTitle(level: RelationLevel, config: RelationsConfig?): String {
    val language = LocalConfiguration.current.locales[0].language
    return config?.label(level, language) ?: stringResource(level.titleRes())
}

public fun levelIcon(level: RelationLevel, config: RelationsConfig?): String =
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
public fun summaryText(summary: CircleProgressSummary, config: RelationsConfig?): String? = when (summary) {
    CircleProgressSummary.Silent -> null
    is CircleProgressSummary.Weeks -> stringResource(R.string.circles_progress_weeks, summary.done, summary.needed)
    is CircleProgressSummary.Eligible -> stringResource(R.string.circles_progress_eligible, levelTitle(summary.target, config))
    is CircleProgressSummary.Missing -> {
        val nouns = summary.pieces.map { stringResource(it.nounRes()) }
        stringResource(R.string.circles_progress_missing, nouns.joinToString(", "))
    }
}

/**
 * Ce qui suit un lien à droite — iso `CircleRowView.trailing` / `ProfileCircleSection.trailing` (iOS) : « Demande envoyée ·
 * Proche » tant que le cran demandé attend, sinon « Demander Proche » quand la loi de demande le laisse proposer, sinon
 * rien. Partagé par « Mes cercles » et le profil : une seule pastille, un seul libellé, une seule cible de 44 dp.
 */
@Composable
public fun CircleRaiseTrailing(
    link: RelationLink,
    name: String,
    pending: RelationLevel?,
    config: RelationsConfig?,
    onRaise: () -> Unit,
) {
    if (pending != null) {
        Text(
            text = stringResource(R.string.circles_pending, levelTitle(pending, config)),
            style = MaterialTheme.typography.labelSmall,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            textAlign = TextAlign.End,
            modifier = Modifier.widthIn(max = 120.dp),
        )
        return
    }
    val offer = link.raiseOffer() as? RelationRaiseOffer.Available ?: return
    val targetTitle = levelTitle(offer.target, config)
    val a11y = stringResource(R.string.circles_action_request_a11y, targetTitle, name)
    Text(
        text = stringResource(R.string.circles_action_request, targetTitle),
        style = MaterialTheme.typography.labelLarge,
        fontWeight = FontWeight.SemiBold,
        color = Color.White,
        modifier = Modifier
            .heightIn(min = 44.dp)
            .clip(CircleShape)
            .background(offer.target.tint())
            .clickable(role = Role.Button, onClick = onRaise)
            .semantics { contentDescription = a11y }
            .padding(horizontal = 12.dp, vertical = 12.dp),
    )
}
