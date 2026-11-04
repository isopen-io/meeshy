package me.meeshy.app.calls

import me.meeshy.sdk.model.PermissionNature
import me.meeshy.sdk.model.call.CallPreflight
import me.meeshy.sdk.model.call.CallPreflightDecision
import me.meeshy.sdk.model.call.IncomingCallAnswer
import me.meeshy.sdk.model.call.IncomingCallPermissionPolicy

/**
 * Les permissions d'un appel, demandées par la porte unique (`PermissionFlow.ensure`) : chaque accès
 * est expliqué AVANT la boîte système, un refus définitif affiche la carte « Ouvrir les Réglages »
 * et un retour avec l'accès accordé relance l'appel sans geste de plus.
 *
 * Le micro est bloquant et annonce son refus ; la caméra ne l'est jamais (`announcesRefusal = false`) :
 * refusée, l'appel continue en audio et le repli le dit (iOS `CallManager+VideoFallback`).
 */
internal class CallPermissionPreflight(
    private val ensure: suspend (PermissionNature, Boolean) -> Boolean,
) {

    suspend fun microphone(): Boolean = ensure(PermissionNature.MICROPHONE, true)

    suspend fun outgoing(isVideo: Boolean): CallPreflightDecision {
        val (mic, camera) = grants(isVideo)
        return CallPreflight.decide(mic, camera, isVideo)
    }

    suspend fun incoming(isVideo: Boolean): IncomingCallAnswer {
        val (mic, camera) = grants(isVideo)
        return IncomingCallPermissionPolicy.decide(mic, camera, isVideo)
    }

    private suspend fun grants(isVideo: Boolean): Pair<Boolean, Boolean> {
        val mic = ensure(PermissionNature.MICROPHONE, true)
        val camera = mic && isVideo && ensure(PermissionNature.CAMERA, false)
        return mic to camera
    }
}
