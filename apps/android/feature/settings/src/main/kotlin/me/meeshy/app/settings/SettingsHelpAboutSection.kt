package me.meeshy.app.settings

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.BugReport
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.HelpOutline
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PrivacyTip
import androidx.compose.material.icons.filled.SupportAgent
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme

/** Aide (iOS `helpSection`) : le centre d'aide. */
@Composable
internal fun SettingsHelpSection(rows: List<SettingsHubRow>, onOpenSupport: () -> Unit) {
    val tint = MeeshyPalette.Success
    SettingsGroup(stringResource(R.string.settings_section_help), Icons.Filled.HelpOutline, tint) {
        SettingsRows(rows, tint) { row ->
            if (row.id == SettingsHubRowId.HELP_CENTER) {
                SettingsChevronRow(Icons.Filled.SupportAgent, stringResource(R.string.settings_help_center), tint, onOpenSupport)
            }
        }
    }
}

/** À propos (iOS `aboutSection`) : liens légaux, diagnostics, puis la vraie version et son build. */
@Composable
internal fun SettingsAboutSection(
    rows: List<SettingsHubRow>,
    appVersion: String,
    onOpenAbout: () -> Unit,
    onOpenTerms: () -> Unit,
    onOpenPrivacyPolicy: () -> Unit,
    onOpenLicenses: () -> Unit,
    onOpenDiagnostics: () -> Unit,
) {
    val tint = MeeshyPalette.Info
    SettingsGroup(stringResource(R.string.settings_section_about), Icons.Filled.Info, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.ABOUT_MEESHY -> SettingsChevronRow(Icons.Filled.Info, stringResource(R.string.settings_about_meeshy), tint, onOpenAbout)
                SettingsHubRowId.TERMS -> SettingsChevronRow(Icons.Filled.Description, stringResource(R.string.settings_terms_of_service), tint, onOpenTerms)
                SettingsHubRowId.PRIVACY_POLICY -> SettingsChevronRow(Icons.Filled.PrivacyTip, stringResource(R.string.settings_privacy_policy), tint, onOpenPrivacyPolicy)
                SettingsHubRowId.LICENSES -> SettingsChevronRow(Icons.Filled.Verified, stringResource(R.string.settings_open_source_licenses), tint, onOpenLicenses)
                SettingsHubRowId.DIAGNOSTICS -> SettingsChevronRow(Icons.Filled.BugReport, stringResource(R.string.settings_diagnostics), tint, onOpenDiagnostics)
                SettingsHubRowId.VERSION -> SettingsRow(
                    icon = Icons.Filled.AutoAwesome,
                    title = stringResource(R.string.settings_version_label),
                    color = MeeshyPalette.Warning,
                    value = appVersion,
                    trailing = {
                        Text(
                            text = appVersion,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Medium,
                            color = MeeshyTheme.tokens.textSecondary,
                        )
                    },
                )
                else -> Unit
            }
        }
    }
}
