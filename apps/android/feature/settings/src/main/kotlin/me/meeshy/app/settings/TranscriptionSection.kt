package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.feature.settings.R
import me.meeshy.ui.component.settings.SettingsRow
import me.meeshy.ui.component.settings.SettingsSeparator
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette

/**
 * Section « Transcription » (iOS `transcriptionSection`) : l'interrupteur de transcription
 * automatique des vocaux entrants, puis la rangée « moteur », purement informative (aucun geste).
 */
@Composable
internal fun TranscriptionSection(viewModel: TranscriptionSettingsViewModel = hiltViewModel()) {
    val autoTranscribe by viewModel.autoTranscribeIncoming.collectAsStateWithLifecycle()
    val tint = MeeshyPalette.Indigo300
    SettingsGroup(stringResource(R.string.settings_section_transcription), MeeshyIcons.Quote, tint) {
        NotificationToggleRow(
            label = stringResource(R.string.settings_transcription_auto),
            checked = autoTranscribe,
            onCheckedChange = viewModel::setAutoTranscribeIncoming,
            icon = MeeshyIcons.Waveform,
            color = tint,
        )
        SettingsSeparator(tint)
        val engineLabel = stringResource(R.string.settings_transcription_engine_a11y)
        SettingsRow(
            icon = MeeshyIcons.Info,
            title = stringResource(R.string.settings_transcription_engine),
            color = MeeshyPalette.Neutral500,
            modifier = Modifier.semantics { contentDescription = engineLabel },
        )
    }
}
