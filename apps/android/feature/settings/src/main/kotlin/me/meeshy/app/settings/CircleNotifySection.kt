package me.meeshy.app.settings

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.relation.CircleNotify
import me.meeshy.sdk.model.relation.CircleNotifyAction
import me.meeshy.sdk.model.relation.CircleNotifyFamily
import me.meeshy.sdk.model.relation.RelationAudienceChoice
import me.meeshy.ui.component.settings.SettingsCard
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * **« QUI EST PRÉVENU »** (#14064), Réglages › Notifications — iso de la section web (#14063). Trois familles, une ligne
 * chacune, qui se déplie par action ; chaque action choisit l'un des sept crans (Personne · Sang · Proche · Ami ·
 * Connaissance · Communauté · Public). Sans réglage, la ligne montre le défaut servi (Proche, Proche, Sang) ; une famille
 * dont les actions diffèrent le dit. Sous Personne, Communauté et Public, une phrase dit en clair qui est prévenu.
 *
 * La section est pure : les crans viennent du bloc de notification local ([chosen]) et un choix remonte par [onChoose],
 * que le ViewModel peint aussitôt et met en file vers la passerelle.
 */
@Composable
internal fun CircleNotifySection(
    chosen: Map<String, RelationAudienceChoice>,
    onChoose: (key: String, choice: RelationAudienceChoice) -> Unit,
) {
    Column {
        Text(
            text = stringResource(R.string.settings_circle_notify_title),
            style = MaterialTheme.typography.labelMedium,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        Text(
            text = stringResource(R.string.settings_circle_notify_intro),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        )
        SettingsCard(tint = MeeshyPalette.Indigo500) {
            CircleNotifyFamily.entries.forEach { family ->
                FamilyRow(family = family, chosen = chosen, onChoose = onChoose)
            }
        }
    }
}

@Composable
private fun FamilyRow(
    family: CircleNotifyFamily,
    chosen: Map<String, RelationAudienceChoice>,
    onChoose: (String, RelationAudienceChoice) -> Unit,
) {
    var open by rememberSaveable(family) { mutableStateOf(false) }
    val title = stringResource(familyLabelRes(family))
    val summary = CircleNotify.summaryOf(chosen, family)?.let { stringResource(choiceLabelRes(it)) }
        ?: stringResource(R.string.settings_circle_notify_summary_mixed)
    SettingsRow(
        icon = MeeshyIcons.Person,
        title = title,
        color = MeeshyPalette.Indigo500,
        value = summary,
        modifier = Modifier.clickable(role = Role.Button) { open = !open },
        trailing = {
            Text(
                text = summary,
                style = MaterialTheme.typography.bodyMedium,
                color = MeeshyTheme.tokens.textSecondary,
            )
            Spacer(Modifier.width(MeeshySpacing.xs))
            Icon(
                MeeshyIcons.ChevronForward,
                contentDescription = null,
                tint = MeeshyTheme.tokens.textMuted,
                modifier = Modifier.size(20.dp).rotate(if (open) 90f else 0f),
            )
        },
    )
    if (!open) return
    family.actions.forEach { action ->
        ActionRow(
            family = family,
            action = action,
            value = CircleNotify.valueOf(chosen, family, action),
            onChoose = { onChoose(family.keyOf(action), it) },
        )
    }
}

@Composable
private fun ActionRow(
    family: CircleNotifyFamily,
    action: CircleNotifyAction,
    value: RelationAudienceChoice,
    onChoose: (RelationAudienceChoice) -> Unit,
) {
    var picking by rememberSaveable(family, action) { mutableStateOf(false) }
    val title = stringResource(actionLabelRes(action))
    val current = stringResource(choiceLabelRes(value))
    Column(Modifier.padding(start = MeeshySpacing.xl)) {
        Box {
            SettingsRow(
                icon = MeeshyIcons.BellFilled,
                title = title,
                color = MeeshyPalette.Indigo500,
                value = current,
                modifier = Modifier.clickable(role = Role.DropdownList) { picking = true },
                trailing = {
                    Text(
                        text = current,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MeeshyPalette.Indigo500,
                    )
                },
            )
            DropdownMenu(expanded = picking, onDismissRequest = { picking = false }) {
                RelationAudienceChoice.entries.forEach { choice ->
                    val label = stringResource(choiceLabelRes(choice))
                    DropdownMenuItem(
                        text = { Text(label) },
                        onClick = {
                            picking = false
                            if (choice != value) onChoose(choice)
                        },
                        modifier = Modifier.semantics { selected = choice == value },
                    )
                }
            }
        }
        explanationRes(value)?.let { res ->
            Text(
                text = stringResource(res),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )
        }
    }
}

private fun familyLabelRes(family: CircleNotifyFamily): Int = when (family) {
    CircleNotifyFamily.PUBLICATION -> R.string.settings_circle_notify_family_publication
    CircleNotifyFamily.ON_MY_CONTENT -> R.string.settings_circle_notify_family_on_my_content
    CircleNotifyFamily.ELSEWHERE -> R.string.settings_circle_notify_family_elsewhere
}

private fun actionLabelRes(action: CircleNotifyAction): Int = when (action) {
    CircleNotifyAction.POST -> R.string.settings_circle_notify_action_post
    CircleNotifyAction.REEL -> R.string.settings_circle_notify_action_reel
    CircleNotifyAction.STORY -> R.string.settings_circle_notify_action_story
    CircleNotifyAction.MOOD -> R.string.settings_circle_notify_action_mood
    CircleNotifyAction.REPOST -> R.string.settings_circle_notify_action_repost
    CircleNotifyAction.SHARE -> R.string.settings_circle_notify_action_share
    CircleNotifyAction.COMMENT -> R.string.settings_circle_notify_action_comment
    CircleNotifyAction.REACTION -> R.string.settings_circle_notify_action_reaction
    CircleNotifyAction.QUOTE -> R.string.settings_circle_notify_action_quote
    CircleNotifyAction.REFERENCE -> R.string.settings_circle_notify_action_reference
    CircleNotifyAction.MENTION -> R.string.settings_circle_notify_action_mention
}

internal fun choiceLabelRes(choice: RelationAudienceChoice): Int = when (choice) {
    RelationAudienceChoice.NOBODY -> R.string.settings_circle_notify_choice_nobody
    RelationAudienceChoice.BLOOD -> R.string.settings_circle_notify_choice_blood
    RelationAudienceChoice.CLOSE -> R.string.settings_circle_notify_choice_close
    RelationAudienceChoice.FRIEND -> R.string.settings_circle_notify_choice_friend
    RelationAudienceChoice.ACQUAINTANCE -> R.string.settings_circle_notify_choice_acquaintance
    RelationAudienceChoice.COMMUNITY -> R.string.settings_circle_notify_choice_community
    RelationAudienceChoice.PUBLIC -> R.string.settings_circle_notify_choice_public
}

private fun explanationRes(choice: RelationAudienceChoice): Int? = when (choice) {
    RelationAudienceChoice.NOBODY -> R.string.settings_circle_notify_explain_nobody
    RelationAudienceChoice.COMMUNITY -> R.string.settings_circle_notify_explain_community
    RelationAudienceChoice.PUBLIC -> R.string.settings_circle_notify_explain_public
    else -> null
}
