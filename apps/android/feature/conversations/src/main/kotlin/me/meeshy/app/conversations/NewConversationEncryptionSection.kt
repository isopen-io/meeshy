package me.meeshy.app.conversations

import androidx.annotation.StringRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.model.CreationEncryptionChoice
import me.meeshy.sdk.model.CreationEncryptionMode
import me.meeshy.sdk.model.CreationEncryptionOffer
import me.meeshy.sdk.model.CreationEncryptionUnavailability
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * La section Chiffrement de l'écran de création (décision du 2026-11-01) : un en-tête, une rangée
 * radio par mode offert (libellé + description), le bout en bout « bientôt » là où il ne se
 * choisit pas encore, puis le pied qui dit son irréversibilité. Aucun choix « sans chiffrement ».
 */
@Composable
internal fun NewConversationEncryptionSection(
    offer: CreationEncryptionOffer,
    checked: CreationEncryptionMode,
    enabled: Boolean,
    onSelect: (CreationEncryptionMode) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = MeeshySpacing.lg, vertical = MeeshySpacing.xs),
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xs),
    ) {
        Text(
            text = stringResource(R.string.encryption_create_header),
            style = MaterialTheme.typography.labelLarge,
            fontWeight = FontWeight.SemiBold,
            color = MeeshyTheme.tokens.textSecondary,
            modifier = Modifier.semantics { heading() },
        )
        Column(modifier = Modifier.selectableGroup()) {
            offer.choices.forEach { choice ->
                EncryptionChoiceRow(
                    choice = choice,
                    checked = choice.mode == checked,
                    enabled = enabled && choice.available,
                    onSelect = { onSelect(choice.mode) },
                )
            }
        }
        Text(
            text = stringResource(R.string.encryption_create_footer),
            style = MaterialTheme.typography.bodySmall,
            color = MeeshyTheme.tokens.textMuted,
        )
    }
}

@Composable
private fun EncryptionChoiceRow(
    choice: CreationEncryptionChoice,
    checked: Boolean,
    enabled: Boolean,
    onSelect: () -> Unit,
) {
    val soon = choice.unavailability?.let { stringResource(it.textRes()) }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .selectable(selected = checked, enabled = enabled, role = Role.RadioButton, onClick = onSelect)
            .semantics { if (soon != null) stateDescription = soon },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = checked, onClick = null, enabled = enabled)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Column(modifier = Modifier.padding(vertical = MeeshySpacing.xs)) {
            Text(
                text = stringResource(choice.mode.labelRes()),
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.SemiBold,
                color = if (enabled) MeeshyTheme.tokens.textPrimary else MeeshyTheme.tokens.textMuted,
            )
            Text(
                text = soon ?: stringResource(choice.mode.descriptionRes()),
                style = MaterialTheme.typography.bodySmall,
                color = MeeshyTheme.tokens.textMuted,
            )
        }
    }
}

@StringRes
private fun CreationEncryptionMode.labelRes(): Int = when (this) {
    CreationEncryptionMode.SERVER -> R.string.encryption_mode_server_label
    CreationEncryptionMode.HYBRID -> R.string.encryption_mode_hybrid_label
    CreationEncryptionMode.E2EE -> R.string.encryption_mode_e2ee_label
}

@StringRes
private fun CreationEncryptionMode.descriptionRes(): Int = when (this) {
    CreationEncryptionMode.SERVER -> R.string.encryption_mode_server_description
    CreationEncryptionMode.HYBRID -> R.string.encryption_mode_hybrid_description
    CreationEncryptionMode.E2EE -> R.string.encryption_mode_e2ee_description
}

@StringRes
private fun CreationEncryptionUnavailability.textRes(): Int = when (this) {
    CreationEncryptionUnavailability.GROUPS_NOT_YET -> R.string.encryption_create_e2ee_soon_groups
    CreationEncryptionUnavailability.CLIENT_NOT_YET -> R.string.new_conversation_encryption_e2ee_soon_here
}
