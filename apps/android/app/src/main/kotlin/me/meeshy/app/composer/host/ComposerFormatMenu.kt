package me.meeshy.app.composer.host

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import me.meeshy.app.R
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.FormatVerdict
import me.meeshy.ui.component.composer.LocalOnComposerPlateau
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.ComposerPlateauInk
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Le choix du format, posé dans le couloir du haut (jamais sur la scène) : une pastille qui nomme le
 * format qui GOUVERNE, et — quand la porte en offre plusieurs — un menu dont chaque entrée refusée est
 * GRISÉE AVEC SA RAISON (#4030). Une porte à un seul format n'a pas de chevron : une affordance sans choix
 * n'existe pas (loi 4).
 */
@Composable
fun ComposerFormatMenu(
    selected: ComposerFormat,
    verdicts: List<FormatVerdict>,
    onChoose: (ComposerFormat) -> Unit,
    modifier: Modifier = Modifier,
) {
    var open by rememberSaveable { mutableStateOf(false) }
    val hasMenu = verdicts.size > 1
    val hint = stringResource(R.string.composer_publish_menu_a11y_hint)
    val onPlateau = LocalOnComposerPlateau.current
    val ink = if (onPlateau) ComposerPlateauInk.primary else MeeshyTheme.tokens.textPrimary
    val chevronInk = if (onPlateau) ComposerPlateauInk.secondary else MeeshyTheme.tokens.textSecondary
    Row(
        modifier = modifier
            .heightIn(min = 44.dp)
            .clickable(enabled = hasMenu, role = Role.Button) { open = true }
            .semantics { if (hasMenu) stateDescription = hint }
            .padding(horizontal = MeeshySpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(ComposerFormatCopy.label(selected)),
            style = MaterialTheme.typography.titleMedium,
            color = ink,
        )
        if (hasMenu) Icon(MeeshyIcons.ChevronDown, contentDescription = null, tint = chevronInk)
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            Text(
                text = stringResource(R.string.composer_publish_menu_title),
                style = MaterialTheme.typography.labelMedium,
                color = MeeshyTheme.tokens.textSecondary,
                modifier = Modifier.padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
            )
            verdicts.forEach { verdict ->
                FormatEntry(verdict, isSelected = verdict.format == selected) {
                    open = false
                    onChoose(verdict.format)
                }
            }
        }
    }
}

@Composable
private fun FormatEntry(verdict: FormatVerdict, isSelected: Boolean, onPick: () -> Unit) {
    val reason = verdict.denial?.let { stringResource(ComposerFormatCopy.reason(it)) }
    DropdownMenuItem(
        enabled = verdict.isChoosable,
        onClick = onPick,
        modifier = Modifier.semantics { if (!verdict.isChoosable) disabled() },
        text = {
            Column {
                Text(stringResource(ComposerFormatCopy.label(verdict.format)), style = MaterialTheme.typography.bodyLarge)
                reason?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MeeshyTheme.tokens.textSecondary) }
            }
        },
        trailingIcon = { if (isSelected) Icon(MeeshyIcons.Check, contentDescription = null) },
    )
}
