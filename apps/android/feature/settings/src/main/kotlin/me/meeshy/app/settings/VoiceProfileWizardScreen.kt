package me.meeshy.app.settings

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import me.meeshy.ui.component.voiceprofile.VoiceProfileWizardView
import me.meeshy.ui.theme.MeeshyPalette

/**
 * « Profil vocal » : l'assistant en cinq étapes (iOS `VoiceProfileWizardView`). [accent] est l'accent du compte,
 * calculé par l'appelant ; il colore la progression et le bouton principal.
 */
@Composable
fun VoiceProfileWizardScreen(
    onClose: () -> Unit,
    accent: Color = MeeshyPalette.Indigo500,
    viewModel: VoiceProfileWizardViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val language by viewModel.spokenLanguage.collectAsStateWithLifecycle()
    VoiceProfileWizardView(
        state = state,
        accent = accent,
        initialLanguage = language,
        onClose = onClose,
        onConsentChange = { viewModel.onEvent(VoiceProfileWizardUiEvent.ConsentChanged(it)) },
        onContinueFromConsent = { viewModel.onEvent(VoiceProfileWizardUiEvent.ContinueFromConsent) },
        onBirthDateChange = { viewModel.onEvent(VoiceProfileWizardUiEvent.BirthDateChanged(it)) },
        onVerifyAge = { viewModel.onEvent(VoiceProfileWizardUiEvent.VerifyAge) },
        onSamplesReady = { viewModel.onEvent(VoiceProfileWizardUiEvent.SamplesReady(it)) },
        onErrorDismiss = { viewModel.onEvent(VoiceProfileWizardUiEvent.DismissError) },
    )
}
