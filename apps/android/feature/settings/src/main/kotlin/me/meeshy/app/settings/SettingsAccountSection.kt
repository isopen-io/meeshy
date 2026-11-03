package me.meeshy.app.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.PersonRemove
import androidx.compose.material.icons.filled.Shield
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.sdk.model.settings.SettingsHubHaptic
import me.meeshy.ui.theme.MeeshyPalette

/** Compte (iOS `accountSection`) : Confidentialité, Sécurité (hub), Utilisateurs bloqués, Supprimer le compte (chevron rouge à 60 %). */
@Composable
internal fun SettingsAccountSection(
    rows: List<SettingsHubRow>,
    onOpenPrivacy: () -> Unit,
    onOpenSecurity: () -> Unit,
    onOpenBlockedUsers: () -> Unit,
    onOpenDeleteAccount: () -> Unit,
) {
    val tint = MeeshyPalette.TrackingAccent
    SettingsGroup(stringResource(R.string.settings_section_account), Icons.Filled.AccountCircle, tint) {
        SettingsRows(rows, tint) { row ->
            val heavy = row.haptic == SettingsHubHaptic.HEAVY
            when (row.id) {
                SettingsHubRowId.PRIVACY ->
                    SettingsChevronRow(Icons.Filled.Lock, stringResource(R.string.settings_privacy_title), MeeshyPalette.Indigo500, onOpenPrivacy)
                SettingsHubRowId.SECURITY ->
                    SettingsChevronRow(Icons.Filled.Shield, stringResource(R.string.settings_security), MeeshyPalette.Info, onOpenSecurity)
                SettingsHubRowId.BLOCKED_USERS ->
                    SettingsChevronRow(Icons.Filled.Block, stringResource(R.string.settings_blocked_users), MeeshyPalette.Error, onOpenBlockedUsers)
                SettingsHubRowId.DELETE_ACCOUNT -> SettingsChevronRow(
                    icon = Icons.Filled.PersonRemove,
                    title = stringResource(R.string.settings_delete_account),
                    color = MeeshyPalette.Error,
                    onClick = onOpenDeleteAccount,
                    heavyHaptic = heavy,
                    chevronTint = MeeshyPalette.Error.copy(alpha = 0.6f),
                )
                else -> Unit
            }
        }
    }
}
