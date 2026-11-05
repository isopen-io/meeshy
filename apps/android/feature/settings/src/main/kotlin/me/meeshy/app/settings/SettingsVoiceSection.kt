package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import me.meeshy.feature.settings.R
import me.meeshy.sdk.model.settings.SettingsHubRow
import me.meeshy.sdk.model.settings.SettingsHubRowId
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Profil vocal (iOS `voiceProfileSection`) : gérer son profil (clonage, transcription, suppression), puis le créer —
 * l'étape où se donne le consentement vocal qui fait transcrire et traduire ses vocaux (#16339, #16420).
 */
@Composable
internal fun SettingsVoiceSection(
    rows: List<SettingsHubRow>,
    onManageVoiceProfile: () -> Unit = {},
    onOpenVoiceProfile: () -> Unit,
) {
    val tint = MeeshyPalette.TrackingAccent
    SettingsGroup(stringResource(R.string.settings_section_voice), MeeshyIcons.WaveformMic, tint) {
        SettingsRows(rows, tint) { row ->
            when (row.id) {
                SettingsHubRowId.VOICE_PROFILE_MANAGE -> SettingsChevronRow(
                    MeeshyIcons.WaveformMic,
                    stringResource(R.string.settings_voice_manage),
                    tint,
                    onManageVoiceProfile,
                )
                SettingsHubRowId.VOICE_PROFILE_CREATE -> SettingsChevronRow(
                    MeeshyIcons.AddCircleFilled,
                    stringResource(R.string.settings_voice_create),
                    MeeshyPalette.Success,
                    onOpenVoiceProfile,
                )
                else -> Unit
            }
        }
    }
}
