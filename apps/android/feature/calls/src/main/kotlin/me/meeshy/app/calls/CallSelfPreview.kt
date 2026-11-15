package me.meeshy.app.calls

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.webrtc.VideoTrack

/**
 * Ma caméra AVANT le décroché (vue P17, iOS : la piste locale que la sonnerie démarre) : elle ne sert qu'à MA vignette de
 * l'écran entrant. Aucune piste n'est posée sur un pair, aucune offre ni réponse ne part, rien ne sort de l'appareil
 * avant « Répondre ». La piste vit tant que Caméra est choisie dans la barre ; la couper éteint la caméra.
 */
class CallSelfPreview(private val coordinator: WebRtcCallCoordinator) {
    private val current = MutableStateFlow<VideoTrack?>(null)

    /** La piste de ma caméra tant qu'elle tourne, `null` sinon (accès refusé, aucune caméra, coupée) : la vignette ne s'invente pas. */
    val track: StateFlow<VideoTrack?> = current.asStateFlow()

    /** Ma caméra démarre pour l'aperçu, sauf si elle l'est déjà. */
    fun start() {
        if (current.value != null) return
        if (coordinator.startSelfPreview()) current.value = coordinator.localVideoTrack
    }

    /** Ma caméra d'aperçu s'éteint. */
    fun stop() {
        if (current.value == null) return
        coordinator.stopSelfPreview()
        current.value = null
    }

    /** La réponse ou le refus a refermé la caméra de l'aperçu avec le moteur : la vignette n'a plus de piste à lire. */
    fun handedOff() {
        current.value = null
    }
}
