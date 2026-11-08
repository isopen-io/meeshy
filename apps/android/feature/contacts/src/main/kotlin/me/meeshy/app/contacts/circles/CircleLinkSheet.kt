package me.meeshy.app.contacts.circles

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.contacts.R
import me.meeshy.sdk.model.relation.CirclePerson
import me.meeshy.sdk.model.relation.CirclePersonSetting
import me.meeshy.sdk.model.relation.CircleProgressSummary
import me.meeshy.sdk.model.relation.RelationLink
import me.meeshy.sdk.model.relation.RelationReceptionSetting
import me.meeshy.sdk.model.relation.RelationsConfig
import me.meeshy.sdk.theme.DynamicColorGenerator
import me.meeshy.ui.component.MeeshyAvatar
import me.meeshy.ui.component.rememberPresence
import me.meeshy.ui.component.circles.levelIcon
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.summaryText
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.hexColor

/**
 * Les réglages PAR PERSONNE — blocage du Bring, talkie, écoute, position, selon ce que le cercle ouvre
 * ([CirclePersonSetting]) — arrivent chacun avec son lot du jalon 2 (`PUT /relations/:userId/settings`, #14229).
 * « Bloquer ses Bring » (#16617) et « Couper son talkie » (#16675) sont ACTIFS ([CircleReceptionBlockToggle]). Tant qu'un réglage n'est pas
 * livré, la fiche le MONTRE désactivé et DIT pourquoi :
 * ni cachés (on chercherait où ils sont), ni simulés (un interrupteur sans effet est un mensonge). Miroir du drapeau iOS
 * `circle_person_settings`, fermé.
 */
internal const val CIRCLE_PERSON_SETTINGS_ENABLED = false

/** La fiche d'un lien (#13938) — iso `CircleLinkSheet.swift` : la personne, son niveau, ce qui manque, ses réglages. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CircleLinkSheet(
    link: RelationLink,
    person: CirclePerson?,
    config: RelationsConfig?,
    onDismiss: () -> Unit,
) {
    val tokens = MeeshyTheme.tokens
    val name = person?.name?.takeIf { it.isNotBlank() } ?: "?"
    val level = link.effectiveLevel
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = tokens.backgroundPrimary,
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(
                modifier = Modifier.semantics(mergeDescendants = true) {},
                verticalAlignment = Alignment.CenterVertically,
            ) {
                MeeshyAvatar(
                    name = name,
                    size = 56.dp,
                    containerColor = hexColor(DynamicColorGenerator.colorForName(link.userId)),
                    presence = rememberPresence(link.userId),
                    imageUrl = person?.avatarUrl,
                )
                Spacer(Modifier.width(12.dp))
                Column {
                    Text(text = name, style = MaterialTheme.typography.titleMedium, color = tokens.textPrimary)
                    Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(text = levelIcon(level, config), modifier = Modifier.clearAndSetSemantics {})
                        Text(
                            text = levelTitle(level, config),
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold,
                            color = level.tint(),
                        )
                    }
                }
            }
            summaryText(CircleProgressSummary.of(link), config)?.let {
                Text(text = it, style = MaterialTheme.typography.bodyMedium, color = tokens.textSecondary)
            }
            Text(
                text = stringResource(R.string.circles_sheet_settings_title),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = tokens.textPrimary,
                modifier = Modifier.semantics { heading() },
            )
            val settings = CirclePersonSetting.offered(level)
            if (settings.isEmpty()) {
                Text(
                    text = stringResource(R.string.circles_sheet_settings_none),
                    style = MaterialTheme.typography.bodySmall,
                    color = tokens.textMuted,
                )
            } else {
                if (!CIRCLE_PERSON_SETTINGS_ENABLED && settings.any { it.receptionSetting() == null }) {
                    Text(
                        text = stringResource(R.string.circles_sheet_settings_unavailable),
                        style = MaterialTheme.typography.bodySmall,
                        color = tokens.textMuted,
                    )
                }
                settings.forEach { setting ->
                    val reception = setting.receptionSetting()
                    if (reception != null) {
                        CircleReceptionBlockToggle(
                            userId = link.userId,
                            setting = reception,
                            title = stringResource(setting.titleRes()),
                            detail = setting.detailRes()?.let { stringResource(it) },
                        )
                    } else {
                        SettingRow(stringResource(setting.titleRes()))
                    }
                }
            }
            Spacer(Modifier.heightIn(min = 16.dp))
        }
    }
}

private fun CirclePersonSetting.titleRes(): Int = when (this) {
    CirclePersonSetting.BLOCK_BRING -> R.string.circles_settings_block_bring
    CirclePersonSetting.TALKIE -> R.string.circles_settings_block_talkie
    CirclePersonSetting.LISTENING -> R.string.circles_settings_listening
    CirclePersonSetting.LIVE_LOCATION -> R.string.circles_settings_location
}

private fun CirclePersonSetting.detailRes(): Int? =
    if (this == CirclePersonSetting.TALKIE) R.string.circles_settings_block_talkie_detail else null

/** Les réglages déjà livrés, ACTIFS sur la fiche : les préférences de réception (Bring dès Ami, talkie dès Proche). */
private fun CirclePersonSetting.receptionSetting(): RelationReceptionSetting? = when (this) {
    CirclePersonSetting.BLOCK_BRING -> RelationReceptionSetting.BRING
    CirclePersonSetting.TALKIE -> RelationReceptionSetting.TALKIE
    CirclePersonSetting.LISTENING, CirclePersonSetting.LIVE_LOCATION -> null
}

@Composable
private fun SettingRow(title: String) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .semantics(mergeDescendants = true) {},
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Switch(checked = false, onCheckedChange = null, enabled = CIRCLE_PERSON_SETTINGS_ENABLED)
    }
}
