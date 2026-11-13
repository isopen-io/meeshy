package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
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
    SettingsGroup(stringResource(R.string.settings_section_account), MeeshyIcons.AccountFilled, tint) {
        SettingsRows(rows, tint) { row ->
            val heavy = row.haptic == SettingsHubHaptic.HEAVY
            when (row.id) {
                SettingsHubRowId.PRIVACY ->
                    SettingsChevronRow(MeeshyIcons.LockFilled, stringResource(R.string.settings_privacy_title), MeeshyPalette.Indigo500, onOpenPrivacy)
                SettingsHubRowId.SECURITY ->
                    SettingsChevronRow(MeeshyIcons.ShieldFilled, stringResource(R.string.settings_security), MeeshyPalette.Info, onOpenSecurity, subtitle = stringResource(R.string.settings_security_orientation))
                SettingsHubRowId.BLOCKED_USERS ->
                    SettingsChevronRow(MeeshyIcons.Block, stringResource(R.string.settings_blocked_users), MeeshyPalette.Error, onOpenBlockedUsers)
                SettingsHubRowId.DELETE_ACCOUNT -> SettingsChevronRow(
                    icon = MeeshyIcons.PersonRemove,
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
