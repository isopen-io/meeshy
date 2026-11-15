package me.meeshy.app.settings

import me.meeshy.ui.icons.MeeshyIcons
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
    SettingsGroup(stringResource(R.string.settings_section_help), MeeshyIcons.HelpOutline, tint) {
        SettingsRows(rows, tint) { row ->
            if (row.id == SettingsHubRowId.HELP_CENTER) {
                SettingsChevronRow(MeeshyIcons.SupportAgent, stringResource(R.string.settings_help_center), tint, onOpenSupport)
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
    SettingsGroup(stringResource(R.string.settings_section_about), MeeshyIcons.InfoFilled, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.ABOUT_MEESHY -> SettingsChevronRow(MeeshyIcons.InfoFilled, stringResource(R.string.settings_about_meeshy), tint, onOpenAbout)
                SettingsHubRowId.TERMS -> SettingsChevronRow(MeeshyIcons.Document, stringResource(R.string.settings_terms_of_service), tint, onOpenTerms)
                SettingsHubRowId.PRIVACY_POLICY -> SettingsChevronRow(MeeshyIcons.PrivacyTip, stringResource(R.string.settings_privacy_policy), tint, onOpenPrivacyPolicy)
                SettingsHubRowId.LICENSES -> SettingsChevronRow(MeeshyIcons.VerifiedFilled, stringResource(R.string.settings_open_source_licenses), tint, onOpenLicenses)
                SettingsHubRowId.DIAGNOSTICS -> SettingsChevronRow(MeeshyIcons.BugReport, stringResource(R.string.settings_diagnostics), tint, onOpenDiagnostics)
                SettingsHubRowId.VERSION -> SettingsRow(
                    icon = MeeshyIcons.Sparkles,
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
