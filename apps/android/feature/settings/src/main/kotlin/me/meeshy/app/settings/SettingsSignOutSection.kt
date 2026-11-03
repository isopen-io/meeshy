package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.settings.R
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyRadius
import me.meeshy.ui.theme.MeeshySpacing

@Composable
internal fun SettingsSignOutButton(enabled: Boolean, onClick: () -> Unit) {
    val error = MeeshyPalette.Error
    val hint = stringResource(R.string.settings_logout_hint)
    val shape = RoundedCornerShape(MeeshyRadius.lg)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .background(error.copy(alpha = 0.08f))
            .border(1.dp, error.copy(alpha = 0.25f), shape)
            .semantics { stateDescription = hint }
            .padding(vertical = MeeshySpacing.md),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(MeeshyIcons.SignOut, contentDescription = null, tint = error)
        Spacer(Modifier.width(MeeshySpacing.sm))
        Text(
            text = stringResource(R.string.settings_log_out),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.SemiBold,
            color = error,
        )
    }
}

/** iOS `SettingsView` : alerte « Déconnexion » avant de fermer la session, bouton destructif. */
@Composable
internal fun SettingsLogoutConfirmation(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.settings_logout_confirm_title)) },
        text = { Text(stringResource(R.string.settings_logout_confirm_message)) },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text(stringResource(R.string.settings_log_out), color = MeeshyPalette.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(android.R.string.cancel)) }
        },
    )
}
