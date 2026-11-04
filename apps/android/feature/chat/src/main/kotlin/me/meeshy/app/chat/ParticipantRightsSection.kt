package me.meeshy.app.chat

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.ParticipantCapability
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les droits d'un visiteur. La PRÉSENCE de `entryLink` dans la réponse est la réponse du gateway à « puis-je écrire » :
 * alors un interrupteur par droit annoncé (un seul droit part par écriture) ; sinon lecture seule, et seuls les refus
 * sont listés. Aucun rang n'est consulté ici.
 */
@Composable
internal fun ParticipantRightsSection(
    state: ParticipantProfileUiState,
    onToggle: (ParticipantCapability) -> Unit,
) {
    Text(
        text = stringResource(R.string.participant_profile_capabilities).uppercase(),
        style = MaterialTheme.typography.labelSmall,
        color = MeeshyTheme.tokens.textSecondary,
    )
    if (state.canEditRights) {
        Column(modifier = Modifier.fillMaxWidth()) {
            state.editableCapabilities.forEach { capability ->
                RightSwitchRow(
                    label = stringResource(allowedLabel(capability)),
                    checked = state.isGranted(capability),
                    enabled = !state.rightsWriteInFlight,
                    onChange = { onToggle(capability) },
                )
            }
        }
        if (state.rightsFailed) {
            Text(
                text = stringResource(R.string.participant_profile_history_error),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        return
    }
    if (state.deniedCapabilities.isEmpty()) {
        ReadOnlyRight(MeeshyIcons.VerifiedUser, stringResource(R.string.participant_profile_no_restriction))
    } else {
        state.deniedCapabilities.forEach { capability ->
            ReadOnlyRight(MeeshyIcons.Block, stringResource(deniedLabel(capability)))
        }
    }
}

@Composable
private fun RightSwitchRow(label: String, checked: Boolean, enabled: Boolean, onChange: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 48.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textPrimary,
            modifier = Modifier.weight(1f),
        )
        Switch(
            checked = checked,
            onCheckedChange = { onChange() },
            enabled = enabled,
            colors = SwitchDefaults.colors(checkedTrackColor = MeeshyTheme.tokens.success),
        )
    }
}

@Composable
private fun ReadOnlyRight(icon: androidx.compose.ui.graphics.vector.ImageVector, text: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.sm),
    ) {
        Icon(icon, contentDescription = null, tint = MeeshyTheme.tokens.textSecondary, modifier = Modifier.size(16.dp))
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MeeshyTheme.tokens.textSecondary)
    }
}


private fun allowedLabel(capability: ParticipantCapability): Int = when (capability) {
    ParticipantCapability.CAN_VIEW_HISTORY -> R.string.participant_profile_allowed_can_view_history
    ParticipantCapability.CAN_SEND_MESSAGES -> R.string.participant_profile_allowed_can_send_messages
    ParticipantCapability.CAN_SEND_IMAGES -> R.string.participant_profile_allowed_can_send_images
    ParticipantCapability.CAN_SEND_FILES -> R.string.participant_profile_allowed_can_send_files
    ParticipantCapability.CAN_SEND_VIDEOS -> R.string.participant_profile_allowed_can_send_videos
    ParticipantCapability.CAN_SEND_AUDIOS -> R.string.participant_profile_allowed_can_send_audios
    ParticipantCapability.CAN_SEND_LINKS -> R.string.participant_profile_allowed_can_send_links
    ParticipantCapability.CAN_SEND_LOCATIONS -> R.string.participant_profile_allowed_can_send_locations
}

internal fun deniedLabel(capability: ParticipantCapability): Int = when (capability) {
    ParticipantCapability.CAN_VIEW_HISTORY -> R.string.participant_profile_denied_can_view_history
    ParticipantCapability.CAN_SEND_MESSAGES -> R.string.participant_profile_denied_can_send_messages
    ParticipantCapability.CAN_SEND_IMAGES -> R.string.participant_profile_denied_can_send_images
    ParticipantCapability.CAN_SEND_FILES -> R.string.participant_profile_denied_can_send_files
    ParticipantCapability.CAN_SEND_VIDEOS -> R.string.participant_profile_denied_can_send_videos
    ParticipantCapability.CAN_SEND_AUDIOS -> R.string.participant_profile_denied_can_send_audios
    ParticipantCapability.CAN_SEND_LINKS -> R.string.participant_profile_denied_can_send_links
    ParticipantCapability.CAN_SEND_LOCATIONS -> R.string.participant_profile_denied_can_send_locations
}
