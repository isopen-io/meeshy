package me.meeshy.app.chat

import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.feature.chat.R
import me.meeshy.sdk.model.composer.PendingAttachmentType
import me.meeshy.sdk.model.composer.PendingAttachmentsState
import me.meeshy.sdk.model.media.OutgoingAttachmentRules
import me.meeshy.sdk.voice.VoiceConsentGateProviding
import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Le consentement vocal vu du fil (iOS `ConversationViewModel.voiceConsentMissing` + `grantVoiceAutoTranslationConsent`) :
 * lu au chargement et RELU à chaque retour au premier plan — un consentement donné dans les Réglages retire aussitôt la
 * note sous mes vocaux. L'octroi depuis le popup d'envoi est OPTIMISTE : la note tombe avant la réponse, et un octroi
 * refusé la restaure et le dit ([grantFailures]). Le popup ne se propose qu'une fois par ouverture du fil.
 */
@HiltViewModel
class ChatVoiceConsentViewModel @Inject constructor(
    private val gate: VoiceConsentGateProviding,
) : ViewModel() {

    private val _missing = MutableStateFlow(false)
    val missing: StateFlow<Boolean> = _missing.asStateFlow()

    private val _grantFailures = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val grantFailures: SharedFlow<Unit> = _grantFailures.asSharedFlow()

    private var promptedThisSession = false
    private var reading: Job? = null

    fun refresh() {
        reading?.cancel()
        if (gate.isKnownGranted) {
            _missing.value = false
            return
        }
        reading = viewModelScope.launch { _missing.value = gate.fetchMissing() }
    }

    /** `true` quand l'envoi doit d'abord proposer le consentement : un audio part, il manque, et le fil ne l'a pas proposé. */
    fun claimSendPrompt(hasAudio: Boolean): Boolean {
        if (!OutgoingAttachmentRules.shouldPromptVoiceConsent(hasAudio, _missing.value, promptedThisSession)) return false
        promptedThisSession = true
        return true
    }

    fun grant() {
        reading?.cancel()
        val before = _missing.value
        _missing.value = false
        viewModelScope.launch {
            try {
                gate.grant()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                _missing.value = before
                _grantFailures.tryEmit(Unit)
            }
        }
    }
}

/**
 * Ce que l'écran du fil sait du consentement vocal : [missing] alimente la note sous MES vocaux, [openSettings] ouvre la
 * configuration de la voix (gestion du profil, ou l'assistant), [claimSendPrompt] et [grant] portent le popup d'envoi.
 */
@Immutable
internal class ChatVoiceConsentBinding(
    val missing: Boolean,
    val openSettings: () -> Unit,
    val claimSendPrompt: (hasAudio: Boolean) -> Boolean,
    val grant: () -> Unit,
) {
    companion object {
        val NONE = ChatVoiceConsentBinding(missing = false, openSettings = {}, claimSendPrompt = { false }, grant = {})
    }
}

/** La note de consentement ne se pose que sur MON message qui porte un audio ; toute autre bulle reste la même instance. */
internal fun BubbleContent.withVoiceConsent(missing: Boolean): BubbleContent =
    if (!isOutgoing || audios.isEmpty() || voiceConsentMissing == missing) this else copy(voiceConsentMissing = missing)

internal val PendingAttachmentsState.hasAudio: Boolean get() = items.any { it.type == PendingAttachmentType.AUDIO }

/**
 * Le popup de l'envoi d'un audio sans consentement (iOS `ConversationVoiceConsentAlert`) : « Activer » accorde puis envoie,
 * « Plus tard » envoie tel quel, « Configurer » ouvre la configuration de la voix sans rien envoyer — le plateau reste
 * intact, le vocal attend. Refermé sans choix ([onDismiss]), rien ne part : le prochain envoi part sans popup.
 */
@Composable
internal fun ChatVoiceConsentDialog(
    onAccept: () -> Unit,
    onLater: () -> Unit,
    onConfigure: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.chat_voice_consent_title)) },
        text = { Text(stringResource(R.string.chat_voice_consent_message)) },
        confirmButton = {
            TextButton(onClick = onAccept) { Text(stringResource(R.string.chat_voice_consent_accept)) }
        },
        dismissButton = {
            TextButton(onClick = onConfigure) { Text(stringResource(R.string.chat_voice_consent_configure)) }
            TextButton(onClick = onLater) { Text(stringResource(R.string.chat_voice_consent_later)) }
        },
    )
}
