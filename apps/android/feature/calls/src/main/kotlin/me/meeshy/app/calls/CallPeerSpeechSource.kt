package me.meeshy.app.calls

import android.os.SystemClock
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import me.meeshy.sdk.model.call.CallPeerSpeech
import me.meeshy.sdk.model.call.group.ActiveSpeakerDetector

/**
 * D'où vient « le pair parle » pour l'avatar du duo — caméra coupée (G4.2) et scène audio (P9) : son identifiant (la couleur de
 * l'anneau), le relevé du niveau reçu, et le verdict du maillage quand un groupe est encore montré en duo.
 */
internal class CallPeerSpeechSource(
    val peerUserId: String,
    val level: suspend () -> Double?,
    /** Le verdict relayé du maillage ; `null` hors maillage : le placeholder relève lui-même. */
    val relayed: Boolean?,
) {
    companion object {
        val NONE = CallPeerSpeechSource(peerUserId = "", level = { null }, relayed = null)
    }
}

@Composable
internal fun rememberCallPeerSpeechSource(viewModel: CallViewModel, peerUserId: String, mesh: GroupCallMeshUi): CallPeerSpeechSource {
    val relayed = CallPeerSpeech.relayed(mesh.isActive, mesh.speakingUserIds, peerUserId.takeIf { it.isNotBlank() })
    return remember(viewModel, peerUserId, relayed) { CallPeerSpeechSource(peerUserId, viewModel::peerAudioLevel, relayed) }
}

/**
 * Le pair parle-t-il ? Relevé toutes les 400 ms (cadence du maillage) et seulement tant que l'avatar est à l'écran
 * — le moniteur de qualité ne relève qu'à 5 s, trop lent pour la parole. Un verdict relayé évite un second `getStats`.
 * Chaque relevé rend un détecteur neuf ; l'hôte ne lit que le verdict dérivé, donc ne se recompose qu'au basculement.
 */
@Composable
internal fun rememberPeerSpeaking(source: CallPeerSpeechSource): Boolean {
    val speech = remember { mutableStateOf(CallPeerSpeech()) }
    val speaking = remember { derivedStateOf { speech.value.isSpeaking } }
    val readLevel by rememberUpdatedState(source.level)
    val measures = source.peerUserId.isNotBlank() && source.relayed == null
    LaunchedEffect(measures) {
        speech.value = CallPeerSpeech()
        while (measures && isActive) {
            delay(ActiveSpeakerDetector.SAMPLING_INTERVAL_MILLIS)
            speech.value = speech.value.recording(readLevel(), SystemClock.elapsedRealtime())
        }
    }
    return source.relayed ?: speaking.value
}
